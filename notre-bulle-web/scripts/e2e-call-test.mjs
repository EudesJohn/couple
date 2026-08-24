// Test E2E : appel audio entre deux profils (femme = appelante, homme = répondant)
// Deux navigateurs Chrome SÉPARÉS : femme sur 9225, homme sur 9226.
import fs from 'node:fs';

const WOMAN_ID = '3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c';
const MAN_ID = '0edca7b6-262c-4c0b-b638-a061c937536c';
const WOMAN_EPOCH = 32;
const MAN_EPOCH = 22;
const APP = 'http://localhost:5199';

async function getTargets(port) {
  const res = await fetch(`http://localhost:${port}/json`);
  return res.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('WS erreur'));
  });
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const args = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
        this.logs.push(`[console] ${args}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.logs.push(`[exception] ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description || ''}`);
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
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (res.exceptionDetails) throw new Error('Eval error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    return res.result?.value;
  }
  async waitFor(expression, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = await this.eval(expression);
        if (v) return v;
      } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 300));
    }
    throw new Error('Timeout waiting for: ' + expression);
  }
}

async function main() {
  const wt = await getTargets(9225);
  const mt = await getTargets(9226);
  const wPage = wt.find(t => t.type === 'page' && t.url.startsWith(APP));
  const mPage = mt.find(t => t.type === 'page' && t.url.startsWith(APP));
  if (!wPage || !mPage) { console.log('Onglets introuvables', !!wPage, !!mPage); process.exit(1); }

  const woman = new Page(await connect(wPage.webSocketDebuggerUrl));
  const man = new Page(await connect(mPage.webSocketDebuggerUrl));
  await woman.send('Runtime.enable');
  await man.send('Runtime.enable');

  // Injecter l'auth dans chaque navigateur (localStorage séparé) puis recharger
  const authScript = (identity, profileId, epoch) => `
    localStorage.setItem('notre-bulle.identity.v2', '${identity}');
    localStorage.setItem('notre-bulle.last-unlock', String(Date.now()));
    localStorage.setItem('notre-bulle.session-epoch', '${epoch}');
    localStorage.setItem('notre-bulle.profile', JSON.stringify({ id: '${profileId}', display_name: '${identity === 'woman' ? 'Mon cœur' : 'Mon amour'}' }));
    localStorage.setItem('notre-bulle.profile_ts', String(Date.now()));
    localStorage.removeItem('notre-bulle.pin-hash');
    'auth OK'
  `;
  await woman.eval(authScript('woman', WOMAN_ID, WOMAN_EPOCH));
  await man.eval(authScript('man', MAN_ID, MAN_EPOCH));

  await woman.send('Page.enable');
  await man.send('Page.enable');
  await woman.send('Page.navigate', { url: APP + '/chat' });
  await man.send('Page.navigate', { url: APP + '/chat' });
  await new Promise(r => setTimeout(r, 4500));

  const wState = await woman.eval('document.body.innerText.slice(0, 120)');
  const mState = await man.eval('document.body.innerText.slice(0, 120)');
  console.log('=== FEMME ===', JSON.stringify(wState.slice(0, 100)));
  console.log('=== HOMME ===', JSON.stringify(mState.slice(0, 100)));

  // FEMME lance un appel audio : bouton téléphone dans le header (bg primary)
  console.log('\n=== ÉTAPE 1 : femme ouvre la sheet appel ===');
  const btnInfo = await woman.eval(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      return btns.map((b, i) => ({
        i,
        label: b.getAttribute('aria-label'),
        text: b.innerText?.slice(0, 20),
        hasSvg: !!b.querySelector('svg'),
        svgPath: b.querySelector('svg path')?.getAttribute('d')?.slice(0, 20),
        bg: getComputedStyle(b).backgroundColor,
      })).filter(x => x.hasSvg);
    })()
  `);
  console.log('Boutons avec SVG:', JSON.stringify(btnInfo, null, 1).slice(0, 800));
  await woman.eval(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => {
        const d = x.querySelector('svg path')?.getAttribute('d') || '';
        return d.startsWith('M22 16.92v3a2 2'); // PhoneIcon
      });
      if (b) b.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 800));
  const sheet = await woman.eval(`document.body.innerText.includes('Audio') && document.body.innerText.includes('Vidéo')`);
  console.log('Sheet visible:', sheet);
  // Cliquer le bouton 'Appel audio' de la sheet (contient PhoneIcon + texte)
  const clickRes = await woman.eval(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const target = btns.find(b => {
        const t = b.innerText || '';
        return t.includes('Appel audio');
      });
      if (!target) return 'bouton introuvable: ' + btns.map(b => JSON.stringify((b.innerText||'').slice(0,30))).join(' | ');
      target.click();
      return 'cliqué: ' + target.innerText.slice(0, 20);
    })()
  `);
  console.log('Clic sur Audio →', clickRes);
  await new Promise(r => setTimeout(r, 3000));
  const wUrl = await woman.eval('location.href');
  const wText2 = await woman.eval('document.body.innerText.slice(-150)');
  console.log('URL femme après clic:', wUrl);
  console.log('Texte femme après clic:', JSON.stringify(wText2.slice(-120)));

  // HOMME : bannière entrante ?
  console.log('\n=== ÉTAPE 2 : homme — appel entrant ===');
  const mRinging = await man.eval(`document.body.innerText.match(/Appel [a-zé]+/)?.join(' ') || document.body.innerText.slice(-200)`);
  console.log('Contenu homme (fin):', JSON.stringify(String(mRinging).slice(-150)));
  const hasAnswer = await man.eval(`!![...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Répondre')`);
  console.log('Bouton Répondre présent:', hasAnswer);
  if (hasAnswer) {
    await man.eval(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Répondre')?.click()`);
    console.log('Clic sur Répondre');
  }
  await new Promise(r => setTimeout(r, 5000));

  // État des deux côtés
  console.log('\n=== ÉTAPE 3 : états ===');
  const wText = await woman.eval(`document.body.innerText.slice(-200)`);
  const mText = await man.eval(`document.body.innerText.slice(-200)`);
  console.log('Femme (fin):', JSON.stringify(wText.slice(-120)));
  console.log('Homme (fin):', JSON.stringify(mText.slice(-120)));

  await new Promise(r => setTimeout(r, 5000));

  // Flux WebRTC
  console.log('\n=== ÉTAPE 4 : flux ===');
  const wStreams = await woman.eval(`
    [...document.querySelectorAll('video,audio')].map(v => ({ tag: v.tagName, tracks: v.srcObject ? v.srcObject.getTracks().map(t => t.kind + ':' + t.readyState).join(',') : 'null', muted: v.muted })).filter(x => x.tracks !== 'null')
  `);
  const mStreams = await man.eval(`
    [...document.querySelectorAll('video,audio')].map(v => ({ tag: v.tagName, tracks: v.srcObject ? v.srcObject.getTracks().map(t => t.kind + ':' + t.readyState).join(',') : 'null', muted: v.muted })).filter(x => x.tracks !== 'null')
  `);
  console.log('Flux femme:', JSON.stringify(wStreams));
  console.log('Flux homme:', JSON.stringify(mStreams));

  console.log('\n=== LOGS FEMME (WebRTC/erreurs) ===');
  woman.logs.filter(l => /WebRTC|webrtc|ICE|offer|answer|stream|track|Error|Erreur|ERR|fail/i.test(l)).slice(-20).forEach(l => console.log(l));
  console.log('\n=== LOGS HOMME (WebRTC/erreurs) ===');
  man.logs.filter(l => /WebRTC|webrtc|ICE|offer|answer|stream|track|Error|Erreur|ERR|fail/i.test(l)).slice(-20).forEach(l => console.log(l));

  process.exit(0);
}

main().catch(err => { console.error('ERREUR TEST:', err.message); process.exit(1); });
