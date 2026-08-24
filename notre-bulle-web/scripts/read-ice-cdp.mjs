// Lit le contenu du <pre> de la page ICE test via CDP
const targets = await (await fetch('http://localhost:9223/json')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('ice-test'));
if (!page) { console.log('Page ICE test introuvable'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
};

ws.onopen = async () => {
  try {
    // Attendre que le gathering ICE soit terminé (le pre contient le résultat)
    let result = '';
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await send('Runtime.evaluate', {
        expression: 'document.getElementById("out").textContent',
        returnByValue: true,
      });
      result = res.result.value;
      if (result.includes('=== ICE gathering terminé ===') || result.includes('ERREUR')) break;
    }
    console.log(result);
  } catch (err) {
    console.log('Erreur CDP:', err.message);
  }
  ws.close();
  process.exit(0);
};

setTimeout(() => { console.log('Timeout global'); process.exit(1); }, 50000);
