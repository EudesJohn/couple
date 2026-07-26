// ============================================================
// Résolution dynamique des IDs de profil selon l'identité
// L'app est utilisée par les 2 partenaires sur le même téléphone
// L'identité (woman/man) est stockée dans localStorage via le PIN
// ============================================================
import { config } from '../constants/config';
import type { UserIdentity } from './auth';

const IDENTITY_KEY = 'notre-bulle.identity';

function getStoredIdentity(): UserIdentity | null {
  try {
    const val = localStorage.getItem(IDENTITY_KEY);
    if (val === 'woman' || val === 'man') return val;
    return null;
  } catch {
    return null;
  }
}

/**
 * Retourne l'ID du profil de l'utilisateur connecté,
 * en fonction de son identité (woman/man).
 *
 * Si l'identité est 'woman' → utilise VITE_PARTNER_PROFILE_ID
 * Si l'identité est 'man'   → utilise VITE_MY_PROFILE_ID
 * Si pas d'identité         → utilise VITE_MY_PROFILE_ID (comportement legacy)
 */
export function getMyProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    // La femme utilise le "partner" ID
    return config.partnerProfileId || config.myProfileId || '';
  }
  // L'homme (ou legacy) utilise le "my" ID
  return config.myProfileId || config.partnerProfileId || '';
}

/**
 * Retourne l'ID du profil du partenaire (inverse de getMyProfileId).
 */
export function getPartnerProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    // Pour la femme, le partenaire est l'homme → VITE_MY_PROFILE_ID
    return config.myProfileId || config.partnerProfileId || '';
  }
  // Pour l'homme (ou legacy), le partenaire est la femme → VITE_PARTNER_PROFILE_ID
  return config.partnerProfileId || config.myProfileId || '';
}
