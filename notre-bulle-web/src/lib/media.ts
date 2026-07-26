// ============================================================
// Service Média — upload to Supabase Storage + compression
// Web: utilise Blob (fetch + blob), plus de dépendance React Native
// ============================================================
import { supabase } from './supabase';
import { config } from '../constants/config';

const BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;

// Générer un nom de fichier unique
function generateFileName(ext: string): string {
  const id = crypto.randomUUID();
  return `${id.slice(0, 8)}-${Date.now()}.${ext}`;
}

// Convertir une URI web (blob URL, data URL, etc.) en Blob
async function uriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith('blob:') || uri.startsWith('http:') || uri.startsWith('https:')) {
    const response = await fetch(uri);
    return response.blob();
  }
  if (uri.startsWith('data:')) {
    const res = await fetch(uri);
    return res.blob();
  }
  return new Blob([''], { type: 'application/octet-stream' });
}

// Extraire l'extension du MIME type
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
    'audio/m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
    'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  };
  return map[mime] ?? 'bin';
}

// ==========================================
// COMPRESSION D'IMAGE (Canvas API)
// ==========================================
export async function compressImage(uri: string, maxWidth = 1200): Promise<string> {
  try {
    const img = new Image();

    // Utiliser l'URI directement (blob:, data:, http: marchent tous avec img.src)
    // Pas besoin de uriToBlob() — le fetch sur blob: échoue parfois (ERR_FILE_NOT_FOUND)
    return new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(uri); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (compressed) => {
            if (compressed) resolve(URL.createObjectURL(compressed));
            else resolve(uri);
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = () => resolve(uri);
      img.src = uri;
    });
  } catch {
    return uri;
  }
}

// Uploader un fichier vers Supabase Storage
// Supporte le suivi de progression via onProgress (utilise XHR)
export async function uploadMedia(
  bucket: keyof typeof BUCKETS,
  uri: string,
  mimeType: string,
  onProgress?: (progress: number) => void
): Promise<{ path: string; publicUrl: string }> {
  const ext = mimeToExt(mimeType);
  const fileName = generateFileName(ext);
  const filePath = `${bucket}/${fileName}`;

  // Web: convertir l'URI (blob URL) en Blob et uploader
  const blob = await uriToBlob(uri);
  const file = new File([blob], fileName, { type: mimeType });

  if (onProgress) {
    // XHR pour le suivi de progression
    await uploadWithXhr(BUCKETS[bucket], filePath, file, onProgress);
  } else {
    // API standard supabase-js (fetch)
    const { data, error } = await supabase.storage
      .from(BUCKETS[bucket])
      .upload(filePath, file, {
        contentType: mimeType,
        cacheControl: '3600',
      });
    if (error) throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKETS[bucket])
    .getPublicUrl(filePath);

  return { path: filePath, publicUrl: urlData.publicUrl };
}

// Upload via XMLHttpRequest avec progression
async function uploadWithXhr(
  bucketName: string,
  filePath: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<void> {
  const url = `${config.supabase.url}/storage/v1/object/${bucketName}/${filePath}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `Bearer ${config.supabase.anonKey}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Erreur réseau pendant l\'upload'));
    xhr.ontimeout = () => reject(new Error('Délai d\'upload dépassé'));
    xhr.send(file);
  });
}

// Supprimer un fichier du Storage
export async function deleteMedia(path: string): Promise<void> {
  const bucket = path.split('/')[0] as keyof typeof BUCKETS;
  // Le chemin contient déjà le préfixe bucket, le passer tel quel
  await supabase.storage.from(BUCKETS[bucket]).remove([path]);
}

// Obtenir l'URL publique
export function getMediaUrl(path: string): string {
  const bucket = path.split('/')[0] as keyof typeof BUCKETS;
  // Le chemin contient déjà le préfixe bucket (ex: "MEDIA/abc.jpg"),
  // NE PAS l'enlever — il fait partie du chemin de stockage réel
  const { data } = supabase.storage.from(BUCKETS[bucket]).getPublicUrl(path);
  return data.publicUrl;
}

// Télécharger un fichier du Storage via l'API client (utilise RLS, pas besoin de bucket public)
export async function downloadMedia(path: string): Promise<Blob> {
  const bucket = path.split('/')[0] as keyof typeof BUCKETS;
  const { data, error } = await supabase.storage.from(BUCKETS[bucket]).download(path);
  if (error || !data) throw error || new Error('Fichier introuvable');
  return data;
}

// Déterminer si un MIME type est une image, vidéo ou audio
export function getMediaType(mime: string): 'image' | 'video' | 'audio' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}
