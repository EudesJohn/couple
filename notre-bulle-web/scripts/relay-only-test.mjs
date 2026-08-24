// Test décisif dans l'APP RÉELLE : est-ce que l'appel s'établit si SEULS les
// candidats relay sont échangés (simule deux réseaux sans connectivité directe) ?
// Le test isolé relay-test.html a prouvé que le relais TURN relaye le média.
// Ici on vérifie que le code de l'app (webrtc.ts) échange correctement ces
// candidats relay : on bloque host/srflx à l'envoi ET à la réception.
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

// Récupère le type d'un candidat SDP (après 'typ')
const RELAY_ONLY = `
(() => {
  if (window.__relayOnly2) return 'déjà installé';
  window.__relayOnly2 = true;
  window.__relayEvents = [];
  const log = (obj) => window.__relayEvents.push(obj);
  const OrigPC = window.RTCPeerConnection;
  const proto = OrigPC.prototype;

  function candType(c) {
    const parts = c.split(' ');
    const i = parts.indexOf('typ');
    return i >= 0 ? parts[i + 1] : '?';
  }

  // À l'ENVOI : ne transmettre que les candidats relay (les host/srflx
  // ne seraient de toute façon pas joignables entre deux réseaux différents)
  const desc = Object.getOwnPropertyDescriptor(proto, 'onicecandidate');
  if (desc && desc.set) {
    Object.defineProperty(proto, 'onicecandidate', {
      ...desc,
      set(v) {
        return desc.set.call(this, function (e) {
          if (e.candidate) {
            const t = candType(e.candidate.candidate);
            log({ t: 'genIce', type: t, cand: e.candidate.candidate.split(' ')[4] + ':' + e.candidate.candidate.split(' ')[5] });
            if (t !== 'relay') return; // bloquer host/srflx
          } else {
            log({ t: 'genIceDone' });
          }
          if (v) v.call(this, e);
        });
      },
    });
  }

  // À la RÉCEPTION : ignorer les candidats non-relay distants
  const origAddIce = proto.addIceCandidate;
  proto.addIceCandidate = async function (candidate) {
    if (candidate && candidate.candidate) {
      const t = candType(candidate.candidate);
      log({ t: 'recvIce', type: t });
      if (t !== 'relay') return;
    }
    return origAddIce.call(this, candidate);
  };

  window.__relayCheck = async function () {
    if (!window.__lastPC) return 'no-pc';
    const stats = await window.__lastPC.getStats();
    let selected = '', bytesReceived = 0, bytesSent = 0;
    stats.forEach(s => {
      if (s.type === 'transport' && s.selectedCandidatePairId) {
        const pair = stats.get(s.selectedCandidatePairId);
        if (pair) {
          const local = pair.localCandidate ? pair.localCandidate.candidateType : '?';
          const remote = pair.remoteCandidate ? pair.remoteCandidate.candidateType : '?';
          selected = local + '->' + remote;
        }
      }
      if (s.type === 'inbound-rtp' && s.bytesReceived) bytesReceived += s.bytesReceived;
      if (s.type === 'outbound-rtp' && s.bytesSent) bytesSent += s.bytesSent;
    });
    return JSON.stringify({ selected, bytesReceived, bytesSent });
  };

  window.RTCPeerConnection = class extends OrigPC {
    constructor(cfg) {
      super(cfg);
      window.__lastPC = this;
      this.addEventListener('connectionstatechange', () => {
        log({ t: 'connState', state: this.connectionState });
      });
    }
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
const wPage = wt.find(t => t.type === 'page');
const mPage = mt.find(t => t.type === 'page');
if (!wPage || !mPage) { console.log('Pages introuvables'); process.exit(1); }

const woman = new Page(await connect(wPage.webSocketDebuggerUrl));
const man = new Page(await connect(mPage.webSocketDebuggerUrl));

const setupW = RELAY_ONLY + `
  localStorage.setItem('notre-bulle.identity.v2', 'woman');
  localStorage.setItem('notre-bulle.last-unlock', String(Date.now()));
  localStorage.setItem('notre-bulle.session-epoch', '32');
  localStorage.setItem('notre-bulle.profile', JSON.stringify({ id: '${WOMAN_ID}', display_name: 'Mon cœur' }));
  localStorage.setItem('notre-bulle.profile_ts', String(Date.now()));
`;
const setupM = RELAY_ONLY + `
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

const instW = await woman.eval('window.__relayOnly2 ? "ok" : "NON installé"');
const instM = await man.eval('window.__relayOnly2 ? "ok" : "NON installé"');
console.log('Filtre relay-only (corrigé) femme:', instW, '| homme:', instM);

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

// Attendre que la connexion relay s'établisse (le relais prend ~2s)
await new Promise(r => setTimeout(r, 15000));

console.log('\n=== ÉVÉNEMENTS FEMME ===');
let wLog = await woman.eval('JSON.stringify(window.__relayEvents || [])');
try { console.log(JSON.stringify(JSON.parse(wLog), null, 1)); } catch { console.log(wLog); }
console.log('\n=== ÉVÉNEMENTS HOMME ===');
let mLog = await man.eval('JSON.stringify(window.__relayEvents || [])');
try { console.log(JSON.stringify(JSON.parse(mLog), null, 1)); } catch { console.log(mLog); }

console.log('\n=== STATS (pair sélectionnée + bytes) ===');
console.log('FEMME:', await woman.eval('window.__relayCheck()'));
console.log('HOMME:', await man.eval('window.__relayCheck()'));

const wSt = await woman.eval(`document.body.innerText.includes('Micro') ? 'EN APPEL (UI)' : document.body.innerText.slice(-80)`);
const mSt = await man.eval(`document.body.innerText.includes('Micro') ? 'EN APPEL (UI)' : document.body.innerText.slice(-80)`);
console.log('\nÉtat femme:', JSON.stringify(String(wSt).slice(-50)));
console.log('État homme:', JSON.stringify(String(mSt).slice(-50)));

process.exit(0);
