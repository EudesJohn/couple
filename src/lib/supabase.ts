import { createClient } from '@supabase/supabase-js';
import { config } from '../constants/config';
import { getOwnProfileId } from './profile';
// import type { Database } from '../types/database'; // à générer via supabase gen types

export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// Helper pour récupérer le profil courant
export async function getCurrentProfile() {
  // Utiliser l'identité stockée (femme/homme) pour résoudre le bon profil
  const ownId = await getOwnProfileId();
  if (!ownId) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', ownId)
    .maybeSingle();

  return data;
}

// Helper pour uploader un fichier dans Storage
export async function uploadFile(
  bucket: string,
  path: string,
  file: Blob | Uint8Array | ArrayBuffer,
  contentType: string
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType });

  if (error) throw error;
  return data;
}

// Helper pour obtenir l'URL publique d'un fichier
export function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
