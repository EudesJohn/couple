// E2E dans l'app RÉELLE : vérifie que le média passe VRAIMENT (bytes RTP > 0),
// pas seulement l'état UI optimiste 'connected'.
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
  if (window.__mediaProbe) return 'déjà installé';
  window.__mediaProbe = true;
  window.__mediaEvents = [];
  window.__console = [];
  const log = (obj) => window.__mediaEvents.push(obj);
  ['error', 'warn'].forEach(sev => {
    const orig = console[sev];
    console[sev] = (...args) => {
      window.__console.push(sev + ': ' + args.map(a => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' '));
      orig.apply(console, args);
    };
  });
  const OrigPC = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends OrigPC {
    constructor(cfg) {
      super(cfg);
      window.__lastPC = this;
      this.addEventListener('connectionstatechange', () => {
        log({ t: 'connState', state: this.connectionState, ice: this.iceConnectionState });
      });
      this.addEventListener('iceconnectionstatechange', () => {
        log({ t: 'iceState', state: this.iceConnectionState });
      });
    }
  };
  // Logger les appels à setLocalDescription / setRemoteDescription
  const proto = OrigPC.prototype;
  const oldSLD = proto.setLocalDescription;
  proto.setLocalDescription = function (d) {
    log({ t: 'setLocal', type: d && d.type, at: Date.now() });
    return oldSLD.apply(this, arguments);
  };
  const oldSRD = proto.setRemoteDescription;
  proto.setRemoteDescription = function (d) {
    log({ t: 'setRemote', type: d && d.type, at: Date.now() });
    return oldSRD.apply(this, arguments);
  };
  window.__mediaCheck = async function () {
    if (!window.__lastPC) return 'no-pc';
    try {
      const stats = await window.__lastPC.getStats();
      let audioIn = 0, audioOut = 0, videoIn = 0, videoOut = 0, selected = '';
      stats.forEach(s => {
        if (s.type === 'transport' && s.selectedCandidatePairId) {
          const pair = stats.get(s.selectedCandidatePairId);
          if (pair) {
            const local = pair.localCandidate ? pair.localCandidate.candidateType : '?';
            const remote = pair.remoteCandidate ? pair.remoteCandidate.candidateType : '?';
            selected = local + '->' + remote;
          }
        }
        if (s.type === 'inbound-rtp') {
          if (s.kind === 'audio') audioIn += s.bytesReceived || 0;
          if (s.kind === 'video') videoIn += s.bytesReceived || 0;
        }
        if (s.type === 'outbound-rtp') {
          if (s.kind === 'audio') audioOut += s.bytesSent || 0;
          if (s.kind === 'video') videoOut += s.bytesSent || 0;
        }
      });
      return JSON.stringify({ selected, audioIn, audioOut, videoIn, videoOut });
    } catch (e) { return 'err:' + e.message; }
  };
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
  async eval(expression, awaitPromise = false) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  }
}

const W_APP = 'http://localhost:5199';
const WOMAN_ID = '3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c';
const MAN_ID = '0edca7b6-262c-4c0b-b638-a061c937536c';

const wt = await getTargets(9225);
const mt = await getTargets(9226);
const wPage = wt.find(t => t.type === 'page');
const mPage = mt.find(t => t.type === 'page');
if (!wPage || !mPage) { console.log('Pages introuvables'); process.exit(1); }

const woman = new Page(await connect(wPage.webSocketDebuggerUrl));
const man = new Page(await connect(mPage.webSocketDebuggerUrl));

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

const instW = await woman.eval('window.__mediaProbe ? "ok" : "NON installé"');
const instM = await man.eval('window.__mediaProbe ? "ok" : "NON installé"');
console.log('Instrumentation média femme:', instW, '| homme:', instM);

// FEMME lance appel audio
console.log('\n=== FEMME lance appel audio ===');
// Polling : attendre que le bouton téléphone soit présent
let phoneFound = false;
for (let i = 0; i < 20; i++) {
  phoneFound = await woman.eval(`!![...document.querySelectorAll('button')].find(x => (x.querySelector('svg path')?.getAttribute('d') || '').startsWith('M22 16.92v3a2 2'))`);
  if (phoneFound) break;
  await new Promise(r => setTimeout(r, 500));
}
console.log('Bouton téléphone:', phoneFound);
if (phoneFound) {
  await woman.eval(`(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find(x => (x.querySelector('svg path')?.getAttribute('d') || '').startsWith('M22 16.92v3a2 2')); if (b) b.click(); })()`);
}
await new Promise(r => setTimeout(r, 900));
const sheet = await woman.eval(`!![...document.querySelectorAll('button')].find(x => (x.innerText||'').includes('Appel audio'))`);
console.log('Sheet visible:', sheet);
if (sheet) await woman.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.innerText||'').includes('Appel audio')); if (b) b.click(); })()`);
console.log('Audio lancé');

// Polling : attendre que le bandeau d'appel entrant apparaisse chez l'homme
let hasBtn = false;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  hasBtn = await man.eval(`!![...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Répondre')`);
  if (hasBtn) break;
}
console.log('=== HOMME répond ===');
console.log('Bouton Répondre:', hasBtn);
if (hasBtn) await man.eval(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Répondre')?.click()`);

// Polling : attendre que les deux soient 'connected' (bouton Micro visible)
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const wConn = await woman.eval(`document.body.innerText.includes('Raccrocher')`);
  const mConn = await man.eval(`document.body.innerText.includes('Raccrocher')`);
  if (wConn && mConn) break;
}

// Laisser le média circuler pendant 8s
await new Promise(r => setTimeout(r, 8000));

console.log('\n=== STATS MÉDIA (après 8s d\'appel) ===');
console.log('FEMME:', await woman.eval('window.__mediaCheck()', true));
console.log('HOMME:', await man.eval('window.__mediaCheck()', true));
console.log('PC femme:', await woman.eval('window.__lastPC ? window.__lastPC.connectionState + "/" + window.__lastPC.iceConnectionState : "aucune PC"'));
console.log('PC homme:', await man.eval('window.__lastPC ? window.__lastPC.connectionState + "/" + window.__lastPC.iceConnectionState : "aucune PC"'));
console.log('\n=== CONSOLE FEMME (erreurs/warnings) ===');
let wc = await woman.eval('JSON.stringify(window.__console || [])');
try { console.log(JSON.stringify(JSON.parse(wc), null, 1).slice(0, 1500)); } catch { console.log(wc); }
console.log('\n=== CONSOLE HOMME (erreurs/warnings) ===');
let mc = await man.eval('JSON.stringify(window.__console || [])');
try { console.log(JSON.stringify(JSON.parse(mc), null, 1).slice(0, 1500)); } catch { console.log(mc); }

console.log('\n=== ÉVÉNEMENTS FEMME ===');
let wLog = await woman.eval('JSON.stringify(window.__mediaEvents || [])');
try { console.log(JSON.stringify(JSON.parse(wLog), null, 1)); } catch { console.log(wLog); }
console.log('\n=== ÉVÉNEMENTS HOMME ===');
let mLog = await man.eval('JSON.stringify(window.__mediaEvents || [])');
try { console.log(JSON.stringify(JSON.parse(mLog), null, 1)); } catch { console.log(mLog); }

const wSt = await woman.eval(`document.body.innerText.includes('Micro') ? 'EN APPEL (UI)' : document.body.innerText.slice(-80)`);
const mSt = await man.eval(`document.body.innerText.includes('Micro') ? 'EN APPEL (UI)' : document.body.innerText.slice(-80)`);
console.log('\nÉtat femme:', JSON.stringify(String(wSt).slice(-50)));
console.log('État homme:', JSON.stringify(String(mSt).slice(-50)));

process.exit(0);
