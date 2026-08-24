// Test E2E du changement de PIN dans l'app réelle.
// 1. Déverrouille l'app (identité femme, epoch + unlock)
// 2. Va dans Paramètres → Changer le code PIN
// 3. Saisit l'ancien code (1234), le nouveau (5678), confirme (5678)
// 4. Vérifie que le toast « Code PIN modifié » apparaît (et PAS « Ancien code incorrect »)
// Le test laisse le PIN à 5678 — le script restore-pin.mjs le remet à 1234.
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

// Récupère l'epoch de session courant pour déverrouiller l'app
const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;
let epoch = 32;
if (SB_URL && SB_KEY) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/get_couple_auth_state`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_profile_id: WOMAN_ID }),
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.session_epoch !== undefined) epoch = data[0].session_epoch;
  } catch { /* fallback 32 */ }
}

const wt = await getTargets(9225);
const page = wt.find(t => t.type === 'page');
if (!page) { console.log('Page introuvable'); process.exit(1); }

const woman = new Page(await connect(page.webSocketDebuggerUrl));

const setup = `
  localStorage.setItem('notre-bulle.identity.v2', 'woman');
  localStorage.setItem('notre-bulle.last-unlock', String(Date.now()));
  localStorage.setItem('notre-bulle.session-epoch', '${epoch}');
  localStorage.setItem('notre-bulle.profile', JSON.stringify({ id: '${WOMAN_ID}', display_name: 'Mon cœur' }));
  localStorage.setItem('notre-bulle.profile_ts', String(Date.now()));
  window.__toasts = [];
  const origText = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'textContent');
`;

await woman.send('Page.enable');
await woman.send('Page.addScriptToEvaluateOnNewDocument', { source: setup });
await woman.send('Page.navigate', { url: W_APP + '/settings' });
await new Promise(r => setTimeout(r, 5000));

// Vérifier qu'on est bien sur /settings et que le bouton « Changer le code PIN » existe
const hasPinBtn = await woman.eval(`!![...document.querySelectorAll('button')].find(b => (b.innerText||'').includes('Changer le code PIN'))`);
console.log('Bouton Changer le code PIN:', hasPinBtn);
if (!hasPinBtn) {
  console.log('Body:', JSON.stringify(await woman.eval('document.body.innerText.slice(0, 200)')));
  process.exit(1);
}

// Ouvrir le formulaire PIN
await woman.eval(`[...document.querySelectorAll('button')].find(b => (b.innerText||'').includes('Changer le code PIN'))?.click()`);
await new Promise(r => setTimeout(r, 500));

// Helper : taper les 4 chiffres du PIN via les touches du clavier PIN
async function typePin(pin) {
  for (const digit of pin) {
    const clicked = await woman.eval(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => x.innerText.trim() === '${digit}');
      if (b) { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; }
      return false;
    })()`);
    if (!clicked) { console.log('Touche introuvable:', digit); process.exit(1); }
    await new Promise(r => setTimeout(r, 200));
  }
}

// Étape 1 : ancien code 1234
const stepLabel1 = await woman.eval(`document.body.innerText.includes('Entre ton code actuel') ? 'old' : '?'`);
console.log('Étape 1 (ancien code):', stepLabel1);
await typePin('1234');
await new Promise(r => setTimeout(r, 800));

// Étape 2 : nouveau code 5678
const stepLabel2 = await woman.eval(`document.body.innerText.includes('Nouveau code à 4 chiffres') ? 'new' : '?'`);
console.log('Étape 2 (nouveau code):', stepLabel2);
await typePin('5678');
await new Promise(r => setTimeout(r, 500));

// Étape 3 : confirmation 5678
const stepLabel3 = await woman.eval(`document.body.innerText.includes('Confirme le nouveau code') ? 'confirm' : '?'`);
console.log('Étape 3 (confirmation):', stepLabel3);
await typePin('5678');
await new Promise(r => setTimeout(r, 1500));

// Vérifier le résultat : toast « Code PIN modifié » ou erreur « Ancien code incorrect »
const bodyText = await woman.eval('document.body.innerText');
const hasSuccess = bodyText.includes('Code PIN modifié');
const hasError = bodyText.includes('Ancien code incorrect');
console.log('\n=== RÉSULTAT ===');
console.log('Toast succès « Code PIN modifié »:', hasSuccess);
console.log('Erreur « Ancien code incorrect »:', hasError);
console.log('Formulaire fermé (plus de « Changer le code PIN »):', await woman.eval(`!document.body.innerText.includes('Entre ton code actuel')`));

if (hasError && !hasSuccess) {
  console.log('\n❌ LE BUG EST TOUJOURS LÀ');
  process.exit(1);
}
console.log(hasSuccess ? '\n✅ FIX VALIDÉ — le changement de PIN fonctionne' : '\n⚠️ Résultat inattendu');
process.exit(hasSuccess ? 0 : 2);
