// ============================================================
// Générateur de sonneries par défaut — WAV 16-bit mono 22050 Hz
// Fichiers minuscules (~90-150 Ko) : mélodies synthétisées.
// Usage: node scripts/gen-ringtones.js
// ============================================================
const fs = require('fs');
const path = require('path');

const SR = 22050;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // fmt chunk size
  buf.writeUInt16LE(1, 20);         // PCM
  buf.writeUInt16LE(1, 22);         // mono
  buf.writeUInt32LE(SR, 24);        // sample rate
  buf.writeUInt32LE(SR * 2, 28);    // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32000), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT_DIR, name), buf);
  console.log(`✅ ${name} (${Math.round(buf.length / 1024)} Ko)`);
}

const note = (semi) => 440 * Math.pow(2, semi / 12); // semi = demi-tons depuis A4

// Enveloppe ADSR simplifiée (attaque rapide, décroissance douce)
function env(t, dur) {
  const attack = 0.01;
  const release = Math.min(0.25, dur * 0.5);
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

function tone(freq, startSec, durSec, gain = 0.5, harmonic = 0) {
  return { freq, startSec, durSec, gain, harmonic };
}

function render(totalSec, tones, vibrato = false) {
  const n = Math.round(totalSec * SR);
  const out = new Float64Array(n);
  for (const t of tones) {
    const start = Math.round(t.startSec * SR);
    const len = Math.round(t.durSec * SR);
    for (let i = 0; i < len && start + i < n; i++) {
      const time = i / SR;
      let f = t.freq;
      if (vibrato) f *= 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * time);
      let s = Math.sin(2 * Math.PI * f * time);
      if (t.harmonic > 0) {
        // Timbre cloche/carillon : harmoniques paires atténuées
        s += 0.35 * Math.sin(2 * Math.PI * 2 * f * time) + 0.15 * Math.sin(2 * Math.PI * 3 * f * time);
      }
      out[start + i] += t.gain * env(time, t.durSec) * s;
    }
  }
  return Array.from(out);
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── 1. « Bulle douce » — arpège chaleureux montant, doux et romantique
{
  const g = 0.42;
  const seq = [];
  const pattern = [
    [note(3), 0.00], [note(7), 0.22], [note(10), 0.44], [note(15), 0.66],   // C E G C
    [note(10), 1.05], [note(7), 1.27],                                       // redescend
    [note(3), 1.70], [note(7), 1.92], [note(10), 2.14], [note(15), 2.36],
    [note(19), 2.75],                                                        // E aigu final
  ];
  for (const [f, st] of pattern) seq.push(tone(f, st, 0.55, g));
  writeWav('bulle_douce.wav', render(4.0, seq));
}

// ─── 2. « Battement » — battements de cœur graves, urgence douce
{
  const thump = (st, gain) => [
    tone(note(-21), st, 0.18, gain),          // basse (fa grave)
    tone(note(-9), st + 0.02, 0.14, gain * 0.6),
  ];
  const seq = [];
  let beat = 0.0;
  for (let k = 0; k < 5; k++) {
    seq.push(...thump(beat, 0.75));           // boum
    seq.push(...thump(beat + 0.30, 0.55));    // boum-boum
    beat += 0.85;
  }
  writeWav('coeur_bat.wav', render(Math.ceil(beat + 0.5), seq));
}

// ─── 3. « Carillon d'or » — carillon cristallin avec vibrato
{
  const g = 0.40;
  const seq = [
    tone(note(12), 0.00, 0.8, g, 1),
    tone(note(16), 0.45, 0.8, g, 1),
    tone(note(19), 0.90, 0.9, g, 1),
    tone(note(24), 1.35, 1.2, g * 1.1, 1),
    tone(note(19), 1.95, 0.9, g * 0.8, 1),
    tone(note(12), 2.50, 1.4, g, 1),
  ];
  writeWav('carillon_or.wav', render(4.6, seq, true));
}

console.log('🎵 Sonneries générées dans assets/sounds/');
