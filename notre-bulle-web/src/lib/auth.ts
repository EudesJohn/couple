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
  PIN_HASH_WOMAN: 'notre-bulle.pin-hash-woman',
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
  const legacy = localStorage.getItem(STORE_KEYS.PIN_HASH);
  const womanHash = localStorage.getItem(STORE_KEYS.PIN_HASH_WOMAN);
  const manHash = localStorage.getItem(STORE_KEYS.PIN_HASH_MAN);
  return legacy !== null || womanHash !== null || manHash !== null;
}

// --- Stockage PIN par rôle (chacun sa clé, pas de risque d'écrasement) ---
export async function savePinHashForRole(role: UserIdentity, hash: string): Promise<void> {
  if (role === 'woman') {
    localStorage.setItem(STORE_KEYS.PIN_HASH_WOMAN, hash);
  } else {
    localStorage.setItem(STORE_KEYS.PIN_HASH_MAN, hash);
  }
}

export async function getStoredPinHashForRole(role: UserIdentity): Promise<string | null> {
  // 1. Toujours essayer la clé explicite du rôle d'abord
  if (role === 'woman') {
    const womanHash = localStorage.getItem(STORE_KEYS.PIN_HASH_WOMAN);
    if (womanHash) return womanHash;
  }
  if (role === 'man') {
    const manHash = localStorage.getItem(STORE_KEYS.PIN_HASH_MAN);
    if (manHash) return manHash;
  }

  // 2. Logique de migration : l'ancienne clé PIN_HASH (notre-bulle.pin-hash)
  //    a été écrite par la 1ʳᵉ configuration — elle appartient donc à
  //    l'identité stockée dans notre-bulle.identity
  const storedIdentity = await getIdentity();

  if (role === 'woman') {
    // L'ancienne clé est celle de la femme UNIQUEMENT si l'identité
    // stockée est 'woman' (sinon elle appartient à l'homme)
    if (storedIdentity === 'woman') return localStorage.getItem(STORE_KEYS.PIN_HASH);
    return null;
  }

  if (role === 'man') {
    // Migration : si l'identité stockée est 'man', l'ancienne clé
    // contient en réalité le hash de l'homme
    if (storedIdentity === 'man') return localStorage.getItem(STORE_KEYS.PIN_HASH);
    return null;
  }

  return null;
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
