// Test d'allocation TURN via le protocole STUN (RFC 8489/5766)
// Vérifie que le relais Metered accepte réellement les connexions.
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Lire la clé depuis .env
const env = fs.readFileSync('.env', 'utf8');
const keyMatch = env.match(/^VITE_METERED_API_KEY=(.+)$/m);
if (!keyMatch) throw new Error('VITE_METERED_API_KEY introuvable dans .env');
const API_KEY = keyMatch[1].trim();

// 1. Récupérer les credentials TURN
const res = await fetch(`https://notre-bulle-web.metered.live/api/v1/turn/credentials?apiKey=${API_KEY}`);
const servers = await res.json();
console.log('Serveurs reçus:', servers.map(s => s.urls).join(', '));

const turnServer = servers.find(s => s.urls === 'turn:standard.relay.metered.ca:443' || s.urls.startsWith('turn:standard.relay.metered.ca:443'));
if (!turnServer) throw new Error('Aucun serveur TURN UDP trouvé');
const url = new URL(turnServer.urls.replace('turn:', 'turn://'));
const host = url.hostname;
const port = url.port || 3478;
const username = turnServer.username;
const password = turnServer.credential;

console.log(`Test allocation TURN → ${host}:${port} (user=${username.slice(0, 6)}...)`);

// ─── Protocole STUN ───
const MAGIC_COOKIE = 0x2112a442;
const REQUEST_TRANSPORT = 0x0019;
const USERNAME_ATTR = 0x0006;
const MESSAGE_INTEGRITY = 0x0008;
const FINGERPRINT = 0x8028;
const XOR_MAPPED_ADDRESS = 0x0020;
const ALLOCATE = 0x0003;

function buildStunMessage(type, transactionId, attrs = []) {
  // attrs: [{type, value(Buffer)}]
  let body = Buffer.alloc(0);
  for (const a of attrs) {
    const len = a.value.length;
    const header = Buffer.alloc(4);
    header.writeUInt16BE(a.type, 0);
    header.writeUInt16BE(len, 2);
    body = Buffer.concat([body, header, a.value, Buffer.alloc((4 - (len % 4)) % 4)]);
  }
  const msg = Buffer.alloc(20);
  msg.writeUInt16BE(type, 0);
  msg.writeUInt16BE(body.length, 2);
  msg.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(msg, 8);
  return Buffer.concat([msg, body]);
}

function encodeAttr(type, value) {
  return { type, value };
}

function decodeStunMessage(buf) {
  const type = buf.readUInt16BE(0);
  const len = buf.readUInt16BE(2);
  const attrs = [];
  let off = 20;
  const end = 20 + len;
  while (off + 4 <= end) {
    const at = buf.readUInt16BE(off);
    const al = buf.readUInt16BE(off + 2);
    const v = buf.subarray(off + 4, off + 4 + al);
    attrs.push({ type: at, value: v });
    off += 4 + al + ((4 - (al % 4)) % 4);
  }
  return { type, attrs };
}

function hmacSha1(key, data) {
  return crypto.createHmac('sha1', key).update(data).digest();
}

function longTermKey(username, realm, password) {
  // RFC 5389 §15.4 : la clé long-term est MD5(username:realm:password),
  // et MESSAGE-INTEGRITY est HMAC-SHA1 avec cette clé.
  return crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest();
}

function addIntegrityAndFingerprint(msg, key) {
  // MESSAGE-INTEGRITY : HMAC-SHA1(key, message jusqu'à la fin de l'attribut MI)
  const miHeader = Buffer.alloc(4);
  miHeader.writeUInt16BE(MESSAGE_INTEGRITY, 0);
  miHeader.writeUInt16BE(20, 2);
  const msgWithMiHeader = Buffer.concat([msg, miHeader]);
  const integrity = hmacSha1(key, msgWithMiHeader);
  return Buffer.concat([msgWithMiHeader, integrity]);
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

// ─── Étape 1 : requête Allocation (sans credentials d'abord pour obtenir le realm) ───
const sock = dgram.createSocket('udp4');
const txId = crypto.randomBytes(12);

const allocationRequest = () => {
  const attrs = [
    encodeAttr(REQUEST_TRANSPORT, Buffer.from([17, 0, 0, 0])), // UDP
    encodeAttr(USERNAME_ATTR, Buffer.from(username, 'utf8')),
  ];
  let msg = buildStunMessage(ALLOCATE, txId, attrs);
  // Sans credentials valides on reçoit 401 avec realm → mais essayons direct avec long-term
  // Il faut le realm : faisons d'abord une requête "unauthorized" pour l'obtenir
  return msg;
};

function send(msg) {
  return new Promise((resolve, reject) => {
    sock.send(msg, port, host, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function recv(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout réponse STUN')), timeout);
    sock.once('message', (msg) => {
      clearTimeout(t);
      resolve(decodeStunMessage(msg));
    });
  });
}

async function main() {
  try {
    // 1. Allocation "nue" → on attend un 401 avec realm
    let msg = buildStunMessage(ALLOCATE, txId, [encodeAttr(REQUEST_TRANSPORT, Buffer.from([17, 0, 0, 0]))]);
    await send(msg);
    let resp = await recv();
    console.log('1ère réponse (attendue: 401 Unauthorized):', '0x' + resp.type.toString(16));
    const realmAttr = resp.attrs.find(a => a.type === 0x0014); // REALM
    const nonceAttr = resp.attrs.find(a => a.type === 0x0015); // NONCE
    if (!realmAttr || !nonceAttr) {
      console.log('Pas de realm/nonce dans la réponse. Réponse brute:', resp.attrs.map(a => '0x' + a.type.toString(16)));
      console.log('⚠️ Le serveur TURN a répondu mais sans demander d\'authentification — vérifier le résultat.');
      process.exit(1);
    }
    const realm = realmAttr.value.toString('utf8');
    const nonce = nonceAttr.value.toString('utf8');
    console.log('Realm:', realm, '| Nonce:', nonce.slice(0, 12) + '...');

    // 2. Allocation avec credentials (long-term)
    const key = longTermKey(username, realm, password);
    const txId2 = crypto.randomBytes(12);
    const attrs = [
      encodeAttr(REQUEST_TRANSPORT, Buffer.from([17, 0, 0, 0])),
      encodeAttr(USERNAME_ATTR, Buffer.from(username, 'utf8')),
      encodeAttr(0x0014, Buffer.from(realm, 'utf8')),   // REALM
      encodeAttr(0x0015, Buffer.from(nonce, 'utf8')),   // NONCE
    ];
    let allocMsg = buildStunMessage(ALLOCATE, txId2, attrs);
    allocMsg = addIntegrityAndFingerprint(allocMsg, key);
    await send(allocMsg);
    resp = await recv();
    console.log('2ème réponse (attendue: 0x103 Success):', '0x' + resp.type.toString(16));
    if (resp.type === 0x0103) {
      console.log('✅ ALLOCATION TURN RÉUSSIE — le relais fonctionne !');
      const xm = resp.attrs.find(a => a.type === XOR_MAPPED_ADDRESS);
      if (xm) console.log('Adresse relayée allouée (XOR-MAPPED-ADDRESS présent)');
      const lifetime = resp.attrs.find(a => a.type === 0x000d);
      if (lifetime) console.log('Lifetime:', lifetime.value.readUInt32BE(0), 's');
    } else if (resp.type === 0x0401) {
      console.log('❌ 401 Unauthorized — credentials refusés');
    } else if (resp.type === 0x0437) {
      console.log('❌ 437 Allocation Mismatch');
    } else if (resp.type === 0x0438) {
      console.log('❌ 438 Stale Nonce — réessayer avec le nouveau nonce');
    } else if (resp.type === 0x0432) {
      console.log('❌ 432 Weak Credentials');
    } else {
      const errAttr = resp.attrs.find(a => a.type === 0x0009);
      console.log('Réponse inattendue:', '0x' + resp.type.toString(16), errAttr ? errAttr.value.toString('utf8') : '');
    }
  } catch (err) {
    console.log('❌ Échec:', err.message);
    console.log('   Le relais TURN est injoignable ou refuse les allocations.');
  } finally {
    sock.close();
    process.exit(0);
  }
}

main();
