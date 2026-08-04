// ============================================================
// Sons d'appel et de notification — Web Audio API
// Synthétisés à la volée (pas de fichiers audio nécessaires)
// ============================================================

let audioCtx: AudioContext | null = null;
let ringtoneTimer: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// ─── NOTIFICATION (message reçu) ───
// Petit "ding" aigu ascendant — 300ms
export function playMessageSound(): void {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.linearRampToValueAtTime(1320, now + 0.12);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch { /* silencieux */ }
}

// ─── SONNERIE APPEL ENTRANT ───
// Double ton (do → mi) toutes les 2,5 secondes
function playRingPattern(): void {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // 1er ton — plus grave
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.value = 523; // Do

    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.25, now + 0.03);
    g1.gain.setValueAtTime(0.25, now + 0.25);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    o1.connect(g1).connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.35);

    // 2e ton — plus aigu
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.value = 659; // Mi

    g2.gain.setValueAtTime(0, now + 0.3);
    g2.gain.linearRampToValueAtTime(0.25, now + 0.33);
    g2.gain.setValueAtTime(0.25, now + 0.6);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    o2.connect(g2).connect(ctx.destination);
    o2.start(now + 0.3);
    o2.stop(now + 0.7);
  } catch { /* silencieux */ }
}

export function startRingtone(): void {
  stopRingtone();
  // ⚠️ Appel entrant = souvent SANS interaction utilisateur préalable dans la
  // session. L'AudioContext peut être 'suspended' par la politique autoplay
  // → on force le resume (si un geste a déjà eu lieu sur la page, le resume
  // fonctionne ; sinon le premier geste ré-armé par unlockAudio() le fera).
  unlockAudio();
  playRingPattern();
  ringtoneTimer = setInterval(playRingPattern, 2500);
}

export function stopRingtone(): void {
  if (ringtoneTimer !== null) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
}

// ─── FIN D'APPEL ───
// Glissando descendant court
export function playCallEndSound(): void {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.linearRampToValueAtTime(330, now + 0.35);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch { /* silencieux */ }
}

// ==========================================================
// DÉVERROUILLAGE AUDIO — indispensable pour iOS/Android
// Sans un geste utilisateur (pointerdown/tap/clavier),
// l'AudioContext reste en état 'suspended' et tous les sons
// (ding message, sonnerie appel) sont muets.
// On le déverrouille dès le 1er geste + à chaque retour dans l'app.
// ==========================================================
export function unlockAudio(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { /* silencieux */ }
}

if (typeof window !== 'undefined') {
  // PAS { once: true } : certains navigateurs re-suspendent le contexte en
  // arrière-plan → on ré-arme le déverrouillage à CHAQUE geste pour être sûr
  // que la sonnerie d'appel entrant (qui peut survenir sans interaction
  // préalable dans la session en cours) ait toujours un contexte "running".
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  // Le navigateur peut re-suspendre l'audio en arrière-plan →
  // re-déverrouiller quand on revient dans l'app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlockAudio();
  });
}
