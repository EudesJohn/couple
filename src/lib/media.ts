// ============================================================
// Service Média — upload to Supabase Storage + helpers
// ============================================================
import { supabase } from './supabase';
import * as Crypto from 'expo-crypto';

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

// Uploader un fichier depuis un URI local vers Supabase Storage
export async function uploadMedia(
  bucket: keyof typeof BUCKETS,
  uri: string,
  mimeType: string
): Promise<{ path: string; publicUrl: string }> {
  const ext = mimeToExt(mimeType);
  const fileName = generateFileName(ext);
  const filePath = `${bucket}/${fileName}`;

  // Lire le fichier depuis l'URI locale
  const response = await fetch(uri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from(BUCKETS[bucket])
    .upload(filePath, blob, {
      contentType: mimeType,
      cacheControl: '3600',
    });

  if (error) throw error;

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
