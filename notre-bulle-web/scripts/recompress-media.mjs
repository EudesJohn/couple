// ============================================================
// Re-compression des médias existants (photos + notes vocales)
// Notre Bulle — Web
//
// Les NOUVEAUX envois sont déjà compressés côté client
// (compressImage 1080px/0.72 + MediaRecorder opus 32 kbps),
// mais les médias stockés AVANT ces fixes gardent leur poids
// d'origine (souvent 1200px/q0.8 pour les photos, ~128 kbps
// pour les voix). Ce script retraite ces fichiers.
//
// USAGE :
//   SB_URL=... SB_KEY=... node scripts/recompress-media.mjs            # dry-run (rien n'est écrit)
//   SB_URL=... SB_KEY=... node scripts/recompress-media.mjs --apply    # écrit réellement
//
//   SB_KEY = clé anon OU service_role (les politiques RLS sont ouvertes
//   pour le couple, la clé anon suffit).
//
// SÉCURITÉ :
//   - Mode dry-run par défaut : affiche ce qui SERAIT compressé et le gain.
//   - `--apply` réécrit les objets en place (upsert même chemin) + met à jour
//     file_size / width / height dans la table attachments.
//   - Un fichier n'est réécrit que si la version compressée est ≥ 5 % plus
//     petite (sinon on garde l'original).
//   - GIF animés et médias déjà petits (≤ 40 Ko) sont ignorés.
// ============================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const SB_URL = process.env.SB_URL || process.env.VITE_SUPABASE_URL || '';
const SB_KEY = process.env.SB_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const APPLY = process.argv.includes('--apply');
const MIN_SAVING_RATIO = 0.95;      // ne réécrire que si newSize < oldSize * 0.95
const SKIP_SMALLER_THAN = 40 * 1024; // fichiers déjà petits → ignorés
const MAX_DIM = 1080;               // même limite que compressImage (web)
const JPEG_QUALITY = 72;            // même qualité que compressImage (web)
const OPUS_BITRATE = '32k';         // même débit que MediaRecorder (web)

const BUCKET_MAP = { MEDIA: 'media', VOICE_NOTES: 'voice-notes', THUMBNAILS: 'thumbnails' };

if (!SB_URL || !SB_KEY) {
  console.error('❌ SB_URL et SB_KEY (ou VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) sont requis.');
  console.error('   Exemple : SB_URL=https://xxx.supabase.co SB_KEY=<anon|service> node scripts/recompress-media.mjs');
  process.exit(1);
}

console.log(`Mode : ${APPLY ? 'APPLY (écrit les fichiers)' : 'DRY-RUN (ne modifie rien)'}`);
console.log(`Supabase : ${SB_URL}\n`);

// ============================================================
// Helpers Supabase REST (mêmes conventions que les autres scripts)
// ============================================================
const headers = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

async function fetchJson(url, opts) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts?.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => null);
}

// Récupérer toutes les pièces jointes image/audio (pas les vidéos)
async function fetchAttachments() {
  // RLS full_access → SELECT sans restriction via la clé anon.
  // Pagination PostgREST : boucle sur les ranges tant qu'il y a des lignes.
  const all = [];
  // Le filtre `or(...)` contient des % (like 'image/%') → il faut les encoder
  // en %25 sinon PostgREST renvoie 500 (requête mal formée).
  const orFilter = encodeURIComponent('or=(mime_type.like.image/%,mime_type.like.audio/%)');
  for (let offset = 0; ; offset += 1000) {
    const url = `${SB_URL}/rest/v1/attachments?select=id,message_id,storage_path,mime_type,file_size,width,height&${orFilter}&order=created_at.asc&offset=${offset}&limit=1000`;
    const rows = await fetchJson(url);
    if (!rows || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

// Télécharger un objet depuis le bucket (le storage_path contient déjà le préfixe)
async function downloadObject(storagePath) {
  const bucketName = bucketFor(storagePath);
  const url = `${SB_URL}/storage/v1/object/${bucketName}/${storagePath}`;
  const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`download ${storagePath} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Écraser un objet en place (upsert même chemin)
async function overwriteObject(storagePath, buf, contentType) {
  const bucketName = bucketFor(storagePath);
  const url = `${SB_URL}/storage/v1/object/${bucketName}/${storagePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload ${storagePath} → HTTP ${res.status} ${await res.text().catch(() => '')}`);
}

// Mettre à jour la ligne attachments (file_size, width, height)
async function updateAttachment(id, fields) {
  const url = `${SB_URL}/rest/v1/attachments?id=eq.${id}`;
  await fetchJson(url, { method: 'PATCH', body: JSON.stringify(fields) });
}

function bucketFor(storagePath) {
  const prefix = storagePath.split('/')[0].toUpperCase();
  return BUCKET_MAP[prefix] || 'media';
}

function fmtBytes(n) {
  if (n == null) return '?';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} Mo` : `${Math.round(n / 1024)} Ko`;
}

// ============================================================
// Compression
// ============================================================

// Compresser une image avec sharp → max 1080px, même format que l'original
// (jpeg/png/webp), qualité alignée sur compressImage.
async function compressImage(buf, mimeType) {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buf).metadata();
  if (meta.pages && meta.pages > 1) return null; // GIF animé → ignorer

  let out = sharp(buf).rotate().resize({ width: MAX_DIM, height: MAX_DIM, withoutEnlargement: true, fit: 'inside' });
  let contentType = mimeType;

  if (mimeType === 'image/jpeg') {
    out = out.jpeg({ quality: JPEG_QUALITY });
  } else if (mimeType === 'image/png') {
    // PNG : réduire sans perte de transparence
    out = out.png({ quality: JPEG_QUALITY, compressionLevel: 9 });
  } else if (mimeType === 'image/webp') {
    out = out.webp({ quality: JPEG_QUALITY });
  } else {
    return null; // format inattendu → ignorer
  }

  const newBuf = await out.toBuffer();
  const newMeta = await sharp(newBuf).metadata();
  return { buf: newBuf, contentType, width: newMeta.width, height: newMeta.height };
}

// Re-encoder une note vocale webm/ogg (opus) → 32 kbps mono (comme les
// nouveaux enregistrements). On ne traite QUE les voix opus : re-encoder un
// m4a en webm changerait le conteneur mais pas la ligne mime_type en base,
// ce qui casserait la lecture mobile → on les ignore.
function compressVoice(buf, mimeType) {
  if (!mimeType.includes('webm') && !mimeType.includes('ogg')) return null;
  const ext = mimeType.includes('ogg') ? '.ogg' : '.webm';
  const tmpIn = `__recompress_in_${Date.now()}${ext}`;
  const tmpOut = `__recompress_out_${Date.now()}.webm`;
  writeFileSync(tmpIn, buf);
  try {
    execFileSync('ffmpeg', [
      '-y', '-i', tmpIn,
      '-c:a', 'libopus', '-b:a', OPUS_BITRATE, '-ac', '1', '-ar', '48000',
      tmpOut,
    ], { stdio: 'ignore' });
    const newBuf = readFileSync(tmpOut);
    return { buf: newBuf, contentType: 'audio/webm' };
  } finally {
    for (const f of [tmpIn, tmpOut]) {
      try { unlinkSync(f); } catch { /* déjà supprimé ou verrouillé */ }
    }
  }
}

// ============================================================
// MAIN
// ============================================================
const attachments = await fetchAttachments();
console.log(`Pièces jointes image/audio trouvées : ${attachments.length}\n`);

let totalOld = 0, totalNew = 0, processed = 0, skipped = 0, errors = 0;

for (const att of attachments) {
  const { id, storage_path: path, mime_type: mime, file_size: oldSize, width, height } = att;
  const isImage = mime?.startsWith('image/');
  const isAudio = mime?.startsWith('audio/');
  if (!isImage && !isAudio) { skipped++; continue; }

  // Ne pas retraiter ce qui est déjà petit. Attention : les envois web
  // insèrent file_size: 0 (inconnu) → 0/null = taille inconnue = à traiter.
  if (oldSize != null && oldSize > 0 && oldSize <= SKIP_SMALLER_THAN) { skipped++; continue; }

  let result = null;
  let refSize = 0;
  try {
    const buf = await downloadObject(path);
    result = isImage
      ? await compressImage(buf, mime)
      : isAudio ? compressVoice(buf, mime) : null;
    if (!result) { skipped++; continue; }

    // Taille de référence : le file_size en base, sinon la taille réellement
    // téléchargée (file_size vaut souvent 0/null pour les anciens médias).
    refSize = oldSize != null && oldSize > 0 ? oldSize : buf.length;

    // Ignorer si la version compressée n'est pas ≥ 5 % plus petite
    if (result.buf.length >= refSize * MIN_SAVING_RATIO) {
      skipped++;
      continue;
    }

    totalOld += buf.length;
    totalNew += result.buf.length;
  } catch (e) {
    errors++;
    console.log(`⚠️  ${path} — ${e.message}`);
    continue;
  }

  const pct = `(-${(100 * (1 - result.buf.length / refSize)).toFixed(0)}%)`;
  console.log(`${isImage ? '🖼️ ' : '🎙️ '} ${path}`);
  console.log(`    ${fmtBytes(refSize)} → ${fmtBytes(result.buf.length)} ${pct}  (${mime})`);

  if (APPLY) {
    try {
      await overwriteObject(path, result.buf, result.contentType);
      const fields = { file_size: result.buf.length };
      if (result.contentType !== mime) { fields.mime_type = result.contentType; }
      if (isImage && result.width) { fields.width = result.width; fields.height = result.height; }
      await updateAttachment(id, fields);
      processed++;
      console.log('    ✅ écrasé + attachments mis à jour');
    } catch (e) {
      errors++;
      console.log(`    ❌ ${e.message}`);
    }
  } else {
    processed++;
  }
}

// ============================================================
// RÉSUMÉ
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`Fichiers retraités : ${processed}`);
console.log(`Ignorés (déjà petits / GIF / non supportés) : ${skipped}`);
console.log(`Erreurs : ${errors}`);
if (totalOld > 0) {
  const gain = 1 - totalNew / totalOld;
  console.log(`Poids total : ${fmtBytes(totalOld)} → ${fmtBytes(totalNew)} (économie ${(100 * gain).toFixed(1)} %)`);
}
console.log('='.repeat(60));
if (!APPLY) {
  console.log('\nDry-run terminé — rien n’a été modifié.');
  console.log('Relance avec --apply pour écrire les fichiers compressés en base.');
}
