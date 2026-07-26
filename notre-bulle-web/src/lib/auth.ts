// ============================================================
// Auth — PIN uniquement + identité (femme/homme)
// Hachage SHA-256 via Web Crypto API (pas de biométrie sur web)
// Codes préréglés première connexion : 1234 = femme, 1235 = homme
// Stockage localStorage
// ============================================================

export type UserIdentity = 'woman' | 'man';

export const PRESET_CODES = {
  WOMAN: '1234',
  MAN: '1235',
} as const;

const STORE_KEYS = {
  PIN_HASH: 'notre-bulle.pin-hash',
  PIN_HASH_MAN: 'notre-bulle.pin-hash-man',
  IS_SETUP_DONE: 'notre-bulle.setup-done',
  IDENTITY: 'notre-bulle.identity',
} as const;

// --- Hachage PIN (SHA-256 via Web Crypto API) ---
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`notre-bulle-salt-${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const computed = await hashPin(pin);
  return computed === hash;
}

// --- Stockage sécurisé du PIN ---
export async function savePinHash(hash: string): Promise<void> {
  localStorage.setItem(STORE_KEYS.PIN_HASH, hash);
}

export async function getStoredPinHash(): Promise<string | null> {
  return localStorage.getItem(STORE_KEYS.PIN_HASH);
}

// --- Flag setup terminé ---
export async function markSetupDone(): Promise<void> {
  localStorage.setItem(STORE_KEYS.IS_SETUP_DONE, 'true');
}

export async function isSetupDone(): Promise<boolean> {
  return localStorage.getItem(STORE_KEYS.IS_SETUP_DONE) === 'true';
}

// --- Vérifier si le code PIN a déjà été défini ---
export async function isPinSet(): Promise<boolean> {
  const womanHash = localStorage.getItem(STORE_KEYS.PIN_HASH);
  const manHash = localStorage.getItem(STORE_KEYS.PIN_HASH_MAN);
  return womanHash !== null || manHash !== null;
}

// --- Stockage PIN par rôle ---
export async function savePinHashForRole(role: UserIdentity, hash: string): Promise<void> {
  if (role === 'woman') {
    localStorage.setItem(STORE_KEYS.PIN_HASH, hash);
  } else {
    localStorage.setItem(STORE_KEYS.PIN_HASH_MAN, hash);
  }
}

export async function getStoredPinHashForRole(role: UserIdentity): Promise<string | null> {
  const key = role === 'woman' ? STORE_KEYS.PIN_HASH : STORE_KEYS.PIN_HASH_MAN;
  return localStorage.getItem(key);
}

// ==========================================================
// Identité (femme / homme) — stockée lors de la 1ʳᵉ connexion
// ==========================================================

export async function saveIdentity(role: UserIdentity): Promise<void> {
  localStorage.setItem(STORE_KEYS.IDENTITY, role);
}

export async function getIdentity(): Promise<UserIdentity | null> {
  const val = localStorage.getItem(STORE_KEYS.IDENTITY);
  if (val === 'woman' || val === 'man') return val;
  return null;
}

export async function isFirstLaunch(): Promise<boolean> {
  return (await getIdentity()) === null;
}

export function getIdentityLabel(role: UserIdentity): string {
  return role === 'woman' ? 'Femme' : 'Homme';
}
