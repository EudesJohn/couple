// ============================================================
// Auth — identité (femme/homme) + session, SANS mot de passe local
//
// 🔐 Le PIN vit UNIQUEMENT côté serveur (colonne profiles.pin_hash,
// fonctions RPC Supabase). Rien de sensible n'est stocké ici :
//   - identity     : femme/homme (choisie via l'UUID)
//   - last-unlock  : horodatage de la fenêtre de déverrouillage (24 h)
//   - session-epoch: compteur de session serveur — s'il change, un
//                    autre appareil s'est connecté → déconnexion forcée
// ============================================================

export type UserIdentity = 'woman' | 'man';

export const STORE_KEYS = {
  // v2 : l'ancienne clé « notre-bulle.identity » (pré-auth serveur) est
  // ignorée → tout appareil déjà utilisé repasse par la saisie de l'UUID.
  IDENTITY: 'notre-bulle.identity.v2',
  LAST_UNLOCK: 'notre-bulle.last-unlock',
  SESSION_EPOCH: 'notre-bulle.session-epoch',
  // Clés historiques (anciens PIN locaux) — nettoyées à la déconnexion
  PIN_HASH: 'notre-bulle.pin-hash',
  PIN_HASH_WOMAN: 'notre-bulle.pin-hash-woman',
  PIN_HASH_MAN: 'notre-bulle.pin-hash-man',
  IS_SETUP_DONE: 'notre-bulle.setup-done',
  LEGACY_IDENTITY: 'notre-bulle.identity',
} as const;

/** Fenêtre de déverrouillage : après ce délai l'app se verrouille. */
export const LOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

// ==========================================================
// Identité (femme / homme) — choisie lors de la 1ʳᵉ connexion
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

// ==========================================================
// Fenêtre de déverrouillage — l'app reste ouverte tant que
// le délai de 24 h (LOCK_WINDOW_MS) n'est pas écoulé
// ==========================================================

export async function saveLastUnlock(): Promise<void> {
  localStorage.setItem(STORE_KEYS.LAST_UNLOCK, String(Date.now()));
}

export async function getLastUnlock(): Promise<number | null> {
  const val = localStorage.getItem(STORE_KEYS.LAST_UNLOCK);
  if (!val) return null;
  const ts = Number(val);
  return Number.isFinite(ts) ? ts : null;
}

// ==========================================================
// Epoch de session — force la déconnexion des autres appareils
// Chaque connexion réussie côté serveur incrémente un compteur
// par profil. Si l'epoch local ne correspond plus à celui du
// serveur, un autre appareil s'est connecté depuis → verrouillage.
// ==========================================================

export async function saveSessionEpoch(epoch: number): Promise<void> {
  localStorage.setItem(STORE_KEYS.SESSION_EPOCH, String(epoch));
}

export async function getSessionEpoch(): Promise<number | null> {
  const val = localStorage.getItem(STORE_KEYS.SESSION_EPOCH);
  if (!val) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

// ==========================================================
// Déconnexion — efface toute trace locale (y compris les
// anciennes clés PIN) → retour à l'état « première connexion »
// ==========================================================
export function resetAuth(): void {
  localStorage.removeItem(STORE_KEYS.IDENTITY);
  localStorage.removeItem(STORE_KEYS.LEGACY_IDENTITY);
  localStorage.removeItem(STORE_KEYS.LAST_UNLOCK);
  localStorage.removeItem(STORE_KEYS.SESSION_EPOCH);
  localStorage.removeItem(STORE_KEYS.PIN_HASH);
  localStorage.removeItem(STORE_KEYS.PIN_HASH_WOMAN);
  localStorage.removeItem(STORE_KEYS.PIN_HASH_MAN);
  localStorage.removeItem(STORE_KEYS.IS_SETUP_DONE);
}
