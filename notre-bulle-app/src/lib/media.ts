// ============================================================
// Service Média — upload to Supabase Storage + compression
// Web: utilise Blob (fetch + blob), Mobile: React Native {uri, type, name}
// ============================================================
import { supabase } from './supabase';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useState, useEffect } from 'react';

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
  await supabase.storage.from(BUCKETS[bucket]).remove([path]);
}

// Cache pour les signed URLs (évite de re-signer à chaque render)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Obtenir l'URL signée (fonctionne avec RLS bucket auth)
// Fallback sur getPublicUrl si le bucket est public.
/** Version synchrone — retourne l'URL publique (fallback immédiat). */
export function getMediaUrl(path: string): string {
  const bucket = BUCKETS[path.split('/')[0] as keyof typeof BUCKETS] || path.split('/')[0];
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Version async — retourne une signed URL (fonctionne avec RLS). */
export async function getSignedMediaUrl(path: string): Promise<string> {
  const bucket = BUCKETS[path.split('/')[0] as keyof typeof BUCKETS] || path.split('/')[0];
  const filePath = path.includes('/') ? path.split('/').slice(1).join('/') : path;

  // Vérifier le cache
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  // Essayer signed URL (fonctionne avec RLS)
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 3600);
    if (!error && data?.signedUrl) {
      signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 3500_000 });
      return data.signedUrl;
    }
  } catch {}

  // Fallback : URL publique
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Hook React — retourne une signed URL (cache) pour un storage_path. */
export function useMediaUrl(storagePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!storagePath) return null;
    const cached = signedUrlCache.get(storagePath);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    // Fallback sync immédiat (URL publique, peut échouer si bucket privé)
    return getMediaUrl(storagePath);
  });

  useEffect(() => {
    if (!storagePath) { setUrl(null); return; }
    const cached = signedUrlCache.get(storagePath);
    if (cached && cached.expiresAt > Date.now()) { setUrl(cached.url); return; }
    getSignedMediaUrl(storagePath).then(setUrl).catch(() => {
      setUrl(getMediaUrl(storagePath));
    });
  }, [storagePath]);

  return url;
}

// Déterminer si un MIME type est une image, vidéo ou audio
export function getMediaType(mime: string): 'image' | 'video' | 'audio' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}
