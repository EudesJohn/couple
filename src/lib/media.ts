// ============================================================
// Service Média — upload to Supabase Storage + compression
// Web: utilise Blob (fetch + blob), Mobile: React Native {uri, type, name}
// ============================================================
import { supabase } from './supabase';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

const isWeb = Platform.OS === 'web';

const BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;

// Générer un nom de fichier unique
function generateFileName(ext: string): string {
  const id = Crypto.randomUUID();
  return `${id.slice(0, 8)}-${Date.now()}.${ext}`;
}

// Convertir une URI web (blob URL, data URL, etc.) en Blob
async function uriToBlob(uri: string): Promise<Blob> {
  // Si c'est déjà une blob URL ou une URL distante
  if (uri.startsWith('blob:') || uri.startsWith('http:') || uri.startsWith('https:')) {
    const response = await fetch(uri);
    return response.blob();
  }
  // Si c'est une data URL
  if (uri.startsWith('data:')) {
    const res = await fetch(uri);
    return res.blob();
  }
  // Fallback: créer un blob minimal
  return new Blob([''], { type: 'application/octet-stream' });
}

// Extraire l'extension du MIME type
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return map[mime] ?? 'bin';
}

// ==========================================
// COMPRESSION D'IMAGE
// ==========================================
export async function compressImage(uri: string): Promise<string> {
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.8, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch (err) {
    // Si la compression échoue, on retourne l'URI original
    console.warn('Compression image impossible, utilisation originale:', err);
    return uri;
  }
}

// Uploader un fichier depuis un URI local vers Supabase Storage
export async function uploadMedia(
  bucket: keyof typeof BUCKETS,
  uri: string,
  mimeType: string
): Promise<{ path: string; publicUrl: string }> {
  const ext = mimeToExt(mimeType);
  const fileName = generateFileName(ext);
  const filePath = `${bucket}/${fileName}`;

  if (isWeb) {
    // Web: convertir l'URI (blob URL) en Blob et uploader
    const blob = await uriToBlob(uri);
    const file = new File([blob], fileName, { type: mimeType });
    const { data, error } = await supabase.storage
      .from(BUCKETS[bucket])
      .upload(filePath, file, {
        contentType: mimeType,
        cacheControl: '3600',
      });
    if (error) throw error;
  } else {
    // Mobile (React Native): objet { uri, type, name }
    const { data, error } = await supabase.storage
      .from(BUCKETS[bucket])
      .upload(filePath, {
        uri,
        type: mimeType,
        name: fileName,
      } as any, {
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (error) throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKETS[bucket])
    .getPublicUrl(filePath);

  return {
    path: filePath,
    publicUrl: urlData.publicUrl,
  };
}

// Supprimer un fichier du Storage
export async function deleteMedia(path: string): Promise<void> {
  const bucket = path.split('/')[0] as keyof typeof BUCKETS;
  const fileName = path.split('/').slice(1).join('/');

  await supabase.storage.from(BUCKETS[bucket]).remove([fileName]);
}

// Obtenir l'URL publique
export function getMediaUrl(path: string): string {
  const bucket = path.split('/')[0] as keyof typeof BUCKETS;
  const { data } = supabase.storage.from(BUCKETS[bucket]).getPublicUrl(
    path.split('/').slice(1).join('/')
  );
  return data.publicUrl;
}

// Déterminer si un MIME type est une image, vidéo ou audio
export function getMediaType(mime: string): 'image' | 'video' | 'audio' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}
