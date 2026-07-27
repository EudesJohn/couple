// ============================================================
// Résolution dynamique des IDs de profil selon l'identité
// L'app est utilisée par les 2 partenaires sur le même téléphone
// L'identité (woman/man) est stockée dans localStorage via le PIN
// ============================================================
import { config } from '../constants/config';
import type { UserIdentity } from './auth';

const IDENTITY_KEY = 'notre-bulle.identity';

export function getCurrentIdentity(): UserIdentity | null {
  return getStoredIdentity();
}

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
 * VITE_MY_PROFILE_ID     = UUID de la femme (celle qui configure l'app)
 * VITE_PARTNER_PROFILE_ID = UUID de l'homme
 *
 * getMyProfileId():  woman → myProfileId,  man → partnerProfileId
 * getPartnerProfileId(): woman → partnerProfileId, man → myProfileId
 */
export function getMyProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    return config.myProfileId || config.partnerProfileId || '';
  }
  // Homme (ou legacy)
  return config.partnerProfileId || config.myProfileId || '';
}

/**
 * Retourne l'ID du profil du partenaire (inverse de getMyProfileId).
 */
export function getPartnerProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    // Pour la femme, le partenaire est l'homme
    return config.partnerProfileId || config.myProfileId || '';
  }
  // Pour l'homme (ou legacy), le partenaire est la femme
  return config.myProfileId || config.partnerProfileId || '';
}
