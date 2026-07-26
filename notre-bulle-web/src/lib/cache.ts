// ============================================================
// Cache local — IndexedDB pour messages + localStorage pour profil
// Évite les appels Supabase inutiles au montage des composants
// ============================================================
import type { MessageWithDetails, Profile } from '../types/database';

const DB_NAME = 'notre-bulle-db';
const DB_VERSION = 1;
const PROFILE_CACHE_KEY = 'notre-bulle.profile';

// ==========================================================
// IndexedDB — Messages
// ==========================================================

function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Store messages : keyPath = id, index sur conversation_id
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('conversation_id', 'conversation_id', { unique: false });
      }

      // Store kv (key-value) pour données simples
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Stoque ou remplace tous les messages d'une conversation dans le cache */
export async function cacheMessages(convId: string, msgs: MessageWithDetails[]): Promise<void> {
  if (!msgs.length) return;
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');

    // Supprimer les anciens messages de cette conversation
    const index = store.index('conversation_id');
    const range = IDBKeyRange.only(convId);
    const deleteReq = index.openCursor(range);

    deleteReq.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      // Ajouter tous les messages
      const writeTx = db.transaction('messages', 'readwrite');
      const writeStore = writeTx.objectStore('messages');
      for (const msg of msgs) {
        writeStore.put(msg);
      }
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Récupère les messages en cache pour une conversation */
export async function getCachedMessages(convId: string): Promise<MessageWithDetails[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('conversation_id');
    const range = IDBKeyRange.only(convId);
    const request = index.getAll(range);

    request.onsuccess = () => resolve(request.result as MessageWithDetails[]);
    request.onerror = () => reject(request.error);
  });
}

/** Ajoute un seul message au cache (nouveau message Realtime) */
export async function addCachedMessage(msg: MessageWithDetails): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const request = store.put(msg);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==========================================================
// localStorage — Profil
// ==========================================================

/** Stoque le profil auth dans localStorage */
export function cacheProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage plein ou désactivé — silencieux
  }
}

/** Récupère le profil depuis localStorage */
export function getCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

/** Supprime le cache profil (invalidation) */
export function clearProfileCache(): void {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // silencieux
  }
}

// ==========================================================
// Utilitaires
// ==========================================================

/** Vide tous les caches (messages + profil) */
export async function clearAllCaches(): Promise<void> {
  clearProfileCache();
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['messages', 'kv'], 'readwrite');
    tx.objectStore('messages').clear();
    tx.objectStore('kv').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
