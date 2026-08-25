// ============================================================
// Supabase Proxy Client — masque la clé anon du frontend
// ============================================================
//
// PRINCIPE :
//   Ce module remplace les appels directs à Supabase par des
//   appels à l'API proxy (routes /api/supa/*). La clé anon
//   n'apparaît JAMAIS dans le bundle JS.
//
//   L'API proxy vérifie le JWT de l'utilisateur, vérifie
//   l'autorisation, puis utilise la service_role key côté serveur.
//
// USAGE :
//   import { supaQuery, supaUpsert, supaUpdate, supaDelete } from './supaProxy';
//
//   // Au lieu de : supabase.from('messages').select('*').eq('conversation_id', id)
//   const messages = await supaQuery('messages', { select: '*', filters: { conversation_id: id } });
//
// NOTE : auth et realtime restent côté Supabase client (signInAnonymously,
//   getSession, channel). Seules les opérations de données passent par le proxy.
// ============================================================

import { supabase } from './supabase';

const API_BASE = ''; // Route relative (même domaine en production)

// ============================================================
// Helpers
// ============================================================

/**
 * Récupère le token d'authentification pour les appels proxy.
 * Le proxy vérifie ce token pour authoriser l'accès.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };
    }
  } catch { /* pas de session */ }
  return { 'Content-Type': 'application/json' };
}

/**
 * Appel générique au proxy Supabase.
 */
async function proxyFetch<T = any>(
  path: string,
  options: {
    method?: string;
    body?: any;
  } = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const url = `${API_BASE}/api/supa${path}`;

  const response = await fetch(url, {
    method: options.method || 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `Erreur proxy: ${response.status}`);
  }

  return response.json();
}

// ============================================================
// QUERY — lecture de données
// ============================================================

export interface QueryOptions {
  select?: string;
  filters?: Record<string, any>;
  order?: string;
  limit?: number;
  single?: boolean;
}

/**
 * Interroge une table Supabase via le proxy.
 *
 * Exemple :
 *   supaQuery('messages', {
 *     select: '*, attachments(*)',
 *     filters: { conversation_id: 'abc' },
 *     order: 'created_at.desc',
 *     limit: 50,
 *   })
 */
export async function supaQuery<T = any[]>(
  table: string,
  options: QueryOptions = {}
): Promise<T> {
  return proxyFetch<T>('/query', {
    body: {
      table,
      select: options.select || '*',
      filters: options.filters || null,
      order: options.order || null,
      limit: options.limit || null,
      single: options.single || false,
    },
  });
}

// ============================================================
// UPSERT — insertion ou mise à jour
// ============================================================

/**
 * Insère ou met à jour dans une table.
 *
 * Exemple :
 *   supaUpsert('cycle_entries', {
 *     profile_id: 'abc',
 *     event_date: '2024-01-15',
 *     event_type: 'period',
 *   }, 'profile_id,event_date,event_type')
 */
export async function supaUpsert(
  table: string,
  data: Record<string, any>,
  onConflict?: string
): Promise<void> {
  await proxyFetch('/upsert', {
    body: { table, data, on_conflict: onConflict || null },
  });
}

// ============================================================
// UPDATE — mise à jour de lignes
// ============================================================

/**
 * Met à jour des lignes dans une table.
 *
 * Exemple :
 *   supaUpdate('calls', { status: 'answered' }, { id: 'call-123' })
 */
export async function supaUpdate(
  table: string,
  data: Record<string, any>,
  filters: Record<string, any>
): Promise<void> {
  await proxyFetch('/update', {
    body: { table, data, filters },
  });
}

// ============================================================
// DELETE — suppression de lignes
// ============================================================

/**
 * Supprime des lignes dans une table.
 *
 * Exemple :
 *   supaDelete('cycle_entries', { profile_id: 'abc', event_date: '2024-01-15' })
 */
export async function supaDelete(
  table: string,
  filters: Record<string, any>
): Promise<void> {
  await proxyFetch('/delete', {
    body: { table, filters },
  });
}

// ============================================================
// RPC — appels de fonctions PostgreSQL
// ============================================================

/**
 * Appelle une fonction RPC via le proxy.
 *
 * Exemple :
 *   const result = await supaRpc('get_couple_auth_state', { p_profile_id: 'abc' });
 */
export async function supaRpc<T = any>(
  functionName: string,
  params: Record<string, any>
): Promise<T> {
  return proxyFetch<T>(`/rpc/${functionName}`, {
    body: params,
  });
}

// ============================================================
// STORAGE — upload / download via proxy
// ============================================================

export interface StorageUploadResult {
  path: string;
  publicUrl: string;
}

/**
 * Upload un fichier vers Supabase Storage via le proxy.
 *
 * Étape 1 : le proxy génère une URL signée (service_role key)
 * Étape 2 : le frontend upload le fichier via cette URL
 *
 * Exemple :
 *   const result = await supaStorageUpload('media', 'photo.jpg', blob, 'image/jpeg');
 */
export async function supaStorageUpload(
  bucket: string,
  path: string,
  file: Blob | File,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<StorageUploadResult> {
  // Étape 1 : obtenir l'URL signée du proxy
  const { upload_url } = await proxyFetch<{ upload_url: string; path: string }>(
    '/storage/upload',
    {
      body: { bucket, path, content_type: contentType },
    }
  );

  // Étape 2 : uploader le fichier via l'URL signée
  if (onProgress) {
    // XHR pour le suivi de progression
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', upload_url);
      xhr.setRequestHeader('Content-Type', contentType);

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
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Erreur réseau'));
      xhr.send(file);
    });
  } else {
    // Fetch standard
    const response = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  }

  // Construire l'URL publique (pour l'affichage)
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);

  return { path, publicUrl };
}

/**
 * Télécharge un fichier depuis Supabase Storage via le proxy.
 *
 * Le proxy vérifie l'autorisation, signe une URL, et retourne
 * l'URL de téléchargement.
 */
export async function supaStorageDownload(
  bucket: string,
  path: string,
  options?: { cacheBust?: boolean }
): Promise<Blob> {
  const { download_url } = await proxyFetch<{ download_url: string; path: string }>(
    '/storage/download',
    {
      body: { bucket, path, expires_in: 3600 },
    }
  );

  const finalUrl = options?.cacheBust
    ? `${download_url}?t=${Date.now()}`
    : download_url;

  const response = await fetch(finalUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return response.blob();
}

/**
 * Supprime un fichier du Storage via le proxy.
 */
export async function supaStorageRemove(path: string): Promise<void> {
  await proxyFetch('/storage/remove', {
    body: { table: 'storage', filters: { path } },
  });
}

// ============================================================
// PROFILS — lecture
// ============================================================

/**
 * Récupère le profil de l'utilisateur connecté.
 */
export async function supaGetMyProfile(): Promise<any> {
  return proxyFetch('/profiles/me', { method: 'GET' });
}

/**
 * Récupère un profil par ID.
 */
export async function supaGetProfile(profileId: string): Promise<any> {
  return proxyFetch(`/profiles/${profileId}`, { method: 'GET' });
}

// ============================================================
// EXPORTS pour compatibilité — mapping vers l'ancien API
// ============================================================

/**
 * Interface compatible avec l'ancien supabase.from() pour une
 * migration progressive. Utilise le proxy pour les opérations
 * de données.
 *
 * Exemple (migration progressive) :
 *   // Avant : await supabase.from('messages').select('*')
 *   // Après : await fromProxy('messages').select('*')
 */
export function fromProxy(table: string) {
  return {
    select: (columns?: string) => ({
      eq: (column: string, value: any) => ({
        maybeSingle: () =>
          supaQuery(table, { select: columns || '*', filters: { [column]: value }, single: true }),
        single: () =>
          supaQuery(table, { select: columns || '*', filters: { [column]: value }, single: true }),
        limit: (n: number) =>
          supaQuery(table, { select: columns || '*', filters: { [column]: value }, limit: n }),
        then: (resolve: any) =>
          supaQuery(table, { select: columns || '*', filters: { [column]: value } }).then(resolve),
      }),
      in: (column: string, values: any[]) =>
        supaQuery(table, { select: columns || '*', filters: { [column]: { in: values.join(',') } } }),
      neq: (column: string, value: any) =>
        supaQuery(table, { select: columns || '*', filters: { [column]: { neq: value } } }),
      order: (col: string, opts?: { ascending?: boolean }) => ({
        limit: (n: number) =>
          supaQuery(table, {
            select: columns || '*',
            order: `${col}.${opts?.ascending === false ? 'desc' : 'asc'}`,
            limit: n,
          }),
        then: (resolve: any) =>
          supaQuery(table, {
            select: columns || '*',
            order: `${col}.${opts?.ascending === false ? 'desc' : 'asc'}`,
          }).then(resolve),
      }),
      then: (resolve: any) =>
        supaQuery(table, { select: columns || '*' }).then(resolve),
    }),
    insert: (data: Record<string, any> | Record<string, any>[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      const payload = Array.isArray(data) ? data[0] : data;
      return {
        then: (resolve: any) =>
          supaUpsert(table, payload, options?.onConflict).then(() => resolve({ data: null, error: null })).catch((e) => resolve({ data: null, error: { message: e.message } })),
      };
    },
    update: (data: Record<string, any>) => ({
      eq: (column: string, value: any) => ({
        then: (resolve: any) =>
          supaUpdate(table, data, { [column]: value }).then(() => resolve({ data: null, error: null })).catch((e) => resolve({ data: null, error: { message: e.message } })),
      }),
    }),
    delete: () => ({
      eq: (column: string, value: any) => ({
        then: (resolve: any) =>
          supaDelete(table, { [column]: value }).then(() => resolve({ data: null, error: null })).catch((e) => resolve({ data: null, error: { message: e.message } })),
      }),
    }),
    upsert: (data: Record<string, any>, options?: { onConflict?: string }) => ({
      then: (resolve: any) =>
        supaUpsert(table, data, options?.onConflict).then(() => resolve({ data: null, error: null })).catch((e) => resolve({ data: null, error: { message: e.message } })),
    }),
  };
}
