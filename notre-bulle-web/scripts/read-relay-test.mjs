// Ouvre la page de test relay dans Chrome et lit le verdict après 30s
async function getTargets(port) {
  return (await fetch(`http://localhost:${port}/json`)).json();
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('WS erreur'));
  });
}

const PORT = process.argv[2] || 9225;
const URL_TO_OPEN = 'http://localhost:8899/';

const targets = await getTargets(PORT);
let page = targets.find(t => t.type === 'page');
if (!page) { console.log('Pas de page'); process.exit(1); }

const ws = await connect(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaljs = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result?.value;
};

await send('Page.enable');
await send('Page.navigate', { url: URL_TO_OPEN });
console.log('Page ouverte, attente du verdict (35s)...');

// Lire le log progressivement
for (let i = 0; i < 35; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const logText = await evaljs(`document.getElementById('log') ? document.getElementById('log').textContent : ''`);
  const title = await evaljs(`document.title`);
  if (title === 'RELAY-OK' || title === 'RELAY-FAIL') {
    console.log('\n=== LOG COMPLET ===');
    console.log(logText);
    console.log('\n=== VERDICT: ' + title + ' ===');
    process.exit(title === 'RELAY-OK' ? 0 : 1);
  }
}

console.log('\n=== TIMEOUT — LOG PARTIEL ===');
console.log(await evaljs(`document.getElementById('log') ? document.getElementById('log').textContent : 'pas de log'`));
process.exit(2);
