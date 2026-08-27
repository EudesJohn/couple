// ============================================================
// Service Média — upload + download avec token auth
// Télécharge les fichiers Supabase Storage avec le token session.
// Sur mobile: retourne une data URI ou URL signée (pas d'écriture disque).
// Sur web: retourne l'URL (le navigateur gère auth via cookies).
// ============================================================
import { supabase } from './supabase';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useState, useEffect } from 'react';
import { config } from '../constants/config';

const isWeb = Platform.OS === 'web';

const BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;

function generateFileName(ext: string): string {
  const id = Crypto.randomUUID();
  return `${id.slice(0, 8)}-${Date.now()}.${ext}`;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/quicktime': 'mov',
    'audio/m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'audio/ogg': 'ogg', 'audio/webm': 'webm',
  };
  return map[mime] ?? 'bin';
}

// ==========================================
// AUTH HEADERS
// ==========================================
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: config.supabase.anonKey,
    Authorization: session?.access_token
      ? `Bearer ${session.access_token}`
      : `Bearer ${config.supabase.anonKey}`,
  };
}

// ==========================================
// CACHE IN-MEMORY
// ==========================================
const urlCache = new Map<string, string>();

// ==========================================
// OBTENIR L'URL D'UN MÉDIA
// Sur web: URL directe (navigateur gère auth via cookies)
// Sur mobile: signed URL qui marche avec le token auth
// ==========================================
async function getMediaUrlWithAuth(storagePath: string): Promise<string> {
  const cached = urlCache.get(storagePath);
  if (cached) return cached;

  const bucket = storagePath.split('/')[0] as keyof typeof BUCKETS;
  const bucketName = BUCKETS[bucket] ?? bucket;

  if (isWeb) {
    const url = `${config.supabase.url}/storage/v1/object/${bucketName}/${storagePath}`;
    urlCache.set(storagePath, url);
    return url;
  }

  // Mobile: essayer signed URL d'abord (plus fiable)
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 3600);
    if (!error && data?.signedUrl) {
      urlCache.set(storagePath, data.signedUrl);
      return data.signedUrl;
    }
  } catch {}

  // Fallback: URL avec auth headers via fetch
  const headers = await getAuthHeaders();
  const url = `${config.supabase.url}/storage/v1/object/${bucketName}/${storagePath}`;
  try {
    const response = await fetch(url, { headers });
    if (response.ok) {
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      urlCache.set(storagePath, dataUrl);
      return dataUrl;
    }
  } catch {}

  // Dernier recours: URL publique
  const { data } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
  return data.publicUrl;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ==========================================
// UPLOAD
// ==========================================
export async function uploadMedia(
  bucket: keyof typeof BUCKETS,
  uri: string,
  mimeType: string
): Promise<{ path: string; publicUrl: string }> {
  const ext = mimeToExt(mimeType);
  const fileName = generateFileName(ext);
  const filePath = `${bucket}/${fileName}`;

  if (isWeb) {
    const response = await fetch(uri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: mimeType });
    const { error } = await supabase.storage
      .from(BUCKETS[bucket]).upload(filePath, file, { contentType: mimeType, cacheControl: '3600' });
    if (error) throw error;
  } else {
    const { error } = await supabase.storage
      .from(BUCKETS[bucket]).upload(filePath, { uri, type: mimeType, name: fileName } as any, {
        contentType: mimeType, cacheControl: '3600',
      });
    if (error) throw error;
  }

  return { path: filePath, publicUrl: filePath };
}

export async function deleteMedia(path: string): Promise<void> {
  const bucket = path.split('/')[0] as keyof typeof BUCKETS;
  await supabase.storage.from(BUCKETS[bucket]).remove([path]);
}

// ==========================================
// HOOK REACT — retourne l'URL d'un média (avec auth)
// ==========================================
export function useMediaUrl(storagePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) { setUrl(null); return; }
    let cancelled = false;

    getMediaUrlWithAuth(storagePath).then((u) => {
      if (!cancelled) setUrl(u);
    }).catch(() => {
      if (!cancelled) setUrl(null);
    });

    return () => { cancelled = true; };
  }, [storagePath]);

  return url;
}

// URL immédiate (sync, cache si dispo)
export function getMediaUrl(path: string): string {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const bucket = path.split('/')[0] as keyof typeof BUCKETS;
  const { data } = supabase.storage.from(BUCKETS[bucket]).getPublicUrl(path);
  return data.publicUrl;
}

// Async — télécharge avec auth
export async function getSignedMediaUrl(path: string): Promise<string> {
  return getMediaUrlWithAuth(path);
}

export function getMediaType(mime: string): 'image' | 'video' | 'audio' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

// ==========================================
// COMPRESSION D'IMAGE
// ==========================================
export async function compressImage(uri: string): Promise<string> {
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(uri, [{ resize: { width: 1200 } }], { compress: 0.8, format: SaveFormat.JPEG });
    return result.uri;
  } catch { return uri; }
}
