import { createClient } from '@supabase/supabase-js';
import { config } from '../constants/config';
import { cacheProfile, getCachedProfile, clearProfileCache, isProfileCacheStale } from './cache';
import { getMyProfileId } from './profile';

// ============================================================
// Client Supabase — création sécurisée
// Garde le même type que createClient() pour TypeScript
// mais ne crash pas si les variables d'env sont manquantes
// ============================================================

function getSupabaseClient() {
  try {
    if (!config.supabase.url) throw new Error('VITE_SUPABASE_URL non défini');
    return createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  } catch (e: any) {
    console.warn('⚠️ Supabase non disponible:', e?.message ?? e);
    // Stub silencieux qui retourne { data: null, error: message } partout
    return null;
  }
}

const _supabase = getSupabaseClient();

// Proxy infaillible : toute propriété ou méthode retourne un stub
export const supabase = new Proxy({} as any, {
  get(_, prop) {
    if (_supabase && prop in _supabase) return (_supabase as any)[prop];
    if (prop === 'auth') return createAuthStub();
    if (prop === 'storage') return createStorageStub();
    if (prop === 'channel' || prop === 'removeChannel') {
      if (prop === 'removeChannel') return () => {};
      return () => createChannelStub();
    }
    return stubQuery;
  },
});

// ==========================================================
// Stubs sécurisés
// ==========================================================

const STUB_RESULT = { data: null, error: { message: 'Supabase non configuré' } };

function stubQueryChain(): any {
  const fn: any = () => stubQueryChain();
  fn.then = (resolve: any) => resolve(STUB_RESULT);
  fn.catch = (_r?: any) => Promise.resolve(STUB_RESULT);
  fn.finally = (cb: any) => { cb(); return Promise.resolve(STUB_RESULT); };
  return new Proxy(fn, {
    get(t, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return t[prop];
      return stubQueryChain();
    },
  });
}
const stubQuery = stubQueryChain();

function createAuthStub() {
  return {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    signInAnonymously: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    setSession: () => Promise.resolve(STUB_RESULT),
    signOut: () => Promise.resolve(STUB_RESULT),
  };
}

function createStorageStub() {
  const bucket = {
    upload: () => Promise.resolve(STUB_RESULT),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
    list: () => Promise.resolve({ data: [], error: null }),
    download: () => Promise.resolve(STUB_RESULT),
    remove: () => Promise.resolve(STUB_RESULT),
  };
  return { from: () => bucket, listBuckets: () => Promise.resolve({ data: [], error: null }) };
}

function createChannelStub() {
  return { on: () => createChannelStub(), subscribe: () => Promise.resolve(), send: () => Promise.resolve() };
}

// ==========================================================
// Helpers
// ==========================================================

export async function getCurrentProfile() {
  // Cache d'abord — retour immédiat si pas encore périmé
  const cached = getCachedProfile();
  if (cached && !isProfileCacheStale()) return cached;

  // Cache absent ou périmé → fetch Supabase
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('supabase_uid', user.id).maybeSingle();
      if (data) {
        cacheProfile(data);
        return data;
      }
    }
  } catch { /* fallback silencieux — on garde le cache même périmé */ }

  // Fallback : pas de session Auth Supabase → utiliser l'ID de la config
  // (l'app utilise le PIN localStorage, pas Supabase Auth)
  try {
    const profileId = getMyProfileId();
    if (!profileId) return cached;
    const { data } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle();
    if (data) {
      cacheProfile(data);
      return data;
    }
  } catch { /* silencieux */ }

  return cached; // retourne le cache périmé plutôt que rien
}

// Export de la fonction d'invalidation du cache profil
export { clearProfileCache } from './cache';

export async function uploadFile(bucket: string, path: string, file: Blob | Uint8Array | ArrayBuffer, contentType: string) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { contentType });
  if (error) throw error;
  return data;
}

export function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
