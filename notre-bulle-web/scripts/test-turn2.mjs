// Test d'allocation TURN avec la lib node-stun (client éprouvé)
import fs from 'node:fs';
import Stun from 'node-stun';

const env = fs.readFileSync('.env', 'utf8');
const keyMatch = env.match(/^VITE_METERED_API_KEY=(.+)$/m);
const API_KEY = keyMatch[1].trim();

const res = await fetch(`https://notre-bulle-web.metered.live/api/v1/turn/credentials?apiKey=${API_KEY}`);
const servers = await res.json();
const turn = servers.find(s => s.urls === 'turn:standard.relay.metered.ca:443');
const { hostname, port } = new URL(turn.urls.replace('turn:', 'turn://'));
console.log(`Test allocation TURN → ${hostname}:${port} (user=${turn.username.slice(0,6)}...)`);

try {
  const client = Stun.createClient({ host: hostname, port: Number(port) });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), 8000);
    client.on('message', (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    // Requête TURN Allocate (0x0003) avec credentials
    const req = Stun.createMessage(Stun.constants.STUN_BINDING_REQUEST);
    // node-stun gère l'allocation via le message type ALLOCATE
    const allocate = Stun.createMessage(0x0003);
    allocate.setXorMappedAddressAttribute({
      family: 1,
      port: 0,
      address: '0.0.0.0',
    });
    client.send(allocate);
  });
  console.log('Réponse reçue, type:', '0x' + result.messageType.toString(16));
  if (result.messageType === 0x0103) {
    console.log('✅ ALLOCATION TURN RÉUSSIE');
  } else {
    console.log('Réponse (voir attributs):', JSON.stringify(result.attributes || result, null, 2)?.slice(0, 600));
  }
} catch (err) {
  console.log('❌ Échec:', err.message);
}
process.exit(0);
