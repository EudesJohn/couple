// Instrumente RTCPeerConnection dans les deux navigateurs pour capturer
// les iceServers réels et les candidats générés pendant un appel.
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

const INSTRUMENT = `
(() => {
  if (window.__iceInstalled) return 'déjà installé';
  window.__iceInstalled = true;
  window.__iceLog = [];
  const OrigPC = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends OrigPC {
    constructor(cfg) {
      super(cfg);
      window.__iceLog.push({ t: 'ctor', servers: JSON.stringify((cfg && cfg.iceServers || []).map(s => (Array.isArray(s.urls) ? s.urls : [s.urls])).flat()) });
    }
  };
  // Capturer les candidats générés : wrap onicecandidate setter
  const proto = OrigPC.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'onicecandidate');
  if (desc && desc.set) {
    Object.defineProperty(proto, 'onicecandidate', {
      ...desc,
      set(v) {
        return desc.set.call(this, function (e) {
          if (e.candidate) {
            const parts = e.candidate.candidate.split(' ');
            window.__iceLog.push({ t: 'genIce', type: parts[2], cand: parts[3] + ':' + parts[4] });
          } else {
            window.__iceLog.push({ t: 'genIceDone' });
          }
          if (v) v.call(this, e);
        });
      },
    });
  }
  'OK';
})()
`;

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const mid = ++this.id;
      this.pending.set(mid, { resolve, reject });
      this.ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  }
}

const W_APP = 'http://localhost:5199';
const WOMAN_ID = '3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c';
const MAN_ID = '0edca7b6-262c-4c0b-b638-a061c937536c';

const wt = await getTargets(9225);
const mt = await getTargets(9226);
const wPage = wt.find(t => t.type === 'page' && t.url.startsWith(W_APP));
const mPage = mt.find(t => t.type === 'page' && t.url.startsWith(W_APP));
if (!wPage || !mPage) { console.log('Pages introuvables'); process.exit(1); }

const woman = new Page(await connect(wPage.webSocketDebuggerUrl));
const man = new Page(await connect(mPage.webSocketDebuggerUrl));

// Injecter l'instrumentation + auth AVANT le chargement (onNewDocument)
const setupW = INSTRUMENT + `
  localStorage.setItem('notre-bulle.identity.v2', 'woman');
  localStorage.setItem('notre-bulle.last-unlock', String(Date.now()));
  localStorage.setItem('notre-bulle.session-epoch', '32');
  localStorage.setItem('notre-bulle.profile', JSON.stringify({ id: '${WOMAN_ID}', display_name: 'Mon cœur' }));
  localStorage.setItem('notre-bulle.profile_ts', String(Date.now()));
`;
const setupM = INSTRUMENT + `
  localStorage.setItem('notre-bulle.identity.v2', 'man');
  localStorage.setItem('notre-bulle.last-unlock', String(Date.now()));
  localStorage.setItem('notre-bulle.session-epoch', '22');
  localStorage.setItem('notre-bulle.profile', JSON.stringify({ id: '${MAN_ID}', display_name: 'Mon amour' }));
  localStorage.setItem('notre-bulle.profile_ts', String(Date.now()));
`;

await woman.send('Page.enable');
await man.send('Page.enable');
await woman.send('Page.addScriptToEvaluateOnNewDocument', { source: setupW });
await man.send('Page.addScriptToEvaluateOnNewDocument', { source: setupM });
await woman.send('Page.navigate', { url: W_APP + '/chat' });
await man.send('Page.navigate', { url: W_APP + '/chat' });
await new Promise(r => setTimeout(r, 5000));

const instW = await woman.eval('window.__iceInstalled ? "ok" : "NON installé"');
const instM = await man.eval('window.__iceInstalled ? "ok" : "NON installé"');
console.log('Instrumentation femme:', instW, '| homme:', instM);

// FEMME lance appel audio
console.log('\n=== FEMME lance appel audio ===');
await woman.eval(`
  (() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => (x.querySelector('svg path')?.getAttribute('d') || '').startsWith('M22 16.92v3a2 2'));
    if (b) b.click();
  })()
`);
await new Promise(r => setTimeout(r, 900));
const sheet = await woman.eval(`!![...document.querySelectorAll('button')].find(x => (x.innerText||'').includes('Appel audio'))`);
console.log('Sheet visible:', sheet);
if (sheet) await woman.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.innerText||'').includes('Appel audio')); if (b) b.click(); })()`);
console.log('Audio lancé');
await new Promise(r => setTimeout(r, 2500));

console.log('=== HOMME répond ===');
const hasBtn = await man.eval(`!![...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Répondre')`);
console.log('Bouton Répondre:', hasBtn);
if (hasBtn) await man.eval(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Répondre')?.click()`);
await new Promise(r => setTimeout(r, 8000));

console.log('\n=== ICE LOG FEMME ===');
let wLog = await woman.eval('JSON.stringify(window.__iceLog || [])');
try { console.log(JSON.stringify(JSON.parse(wLog), null, 1)); } catch { console.log(wLog); }
console.log('\n=== ICE LOG HOMME ===');
let mLog = await man.eval('JSON.stringify(window.__iceLog || [])');
try { console.log(JSON.stringify(JSON.parse(mLog), null, 1)); } catch { console.log(mLog); }

// États
const wSt = await woman.eval(`document.body.innerText.includes('Micro') ? 'EN APPEL' : document.body.innerText.slice(-80)`);
const mSt = await man.eval(`document.body.innerText.includes('Micro') ? 'EN APPEL' : document.body.innerText.slice(-80)`);
console.log('\nÉtat femme:', JSON.stringify(String(wSt).slice(-50)));
console.log('État homme:', JSON.stringify(String(mSt).slice(-50)));

process.exit(0);
