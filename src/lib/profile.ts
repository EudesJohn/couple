// ============================================================
// Résolution de l'identité (femme /homme) → profile UUID
// Même logique que notre-bulle-web/src/lib/profile.ts
//
// getOwnProfileId() — retourne le VRAI profil de l'utilisateur
//   femme → config.myProfileId
//   homme → config.partnerProfileId
//
// getActualPartnerProfileId() — retourne le VRAI profil du partenaire
//   femme → config.partnerProfileId
//   homme → config.myProfileId
// ============================================================
import { config } from '../constants/config';
import { getIdentity, type UserIdentity } from './auth';

/**
 * getOwnProfileId — retourne le VRAI profil de l'utilisateur.
 *
 * Mapping correct :
 *   femme → myProfileId (SON UUID)
 *   homme → partnerProfileId (SON UUID)
 *
 * ✅ Utiliser pour les opérations PHOTO et DISPLAY_NAME,
 *    pas pour les messages/cycle (rétrocompatibilité).
 */
export async function getOwnProfileId(): Promise<string | null> {
  const identity = await getIdentity();
  if (identity === 'woman') {
    return config.myProfileId || config.partnerProfileId || null;
  }
  if (identity === 'man') {
    return config.partnerProfileId || config.myProfileId || null;
  }
  // Pas d'identité stockée → fallback sur myProfileId
  return config.myProfileId || null;
}

/**
 * getActualPartnerProfileId — retourne le VRAI profil du partenaire.
 *
 * Mapping correct :
 *   femme → partnerProfileId (UUID de l'homme)
 *   homme → myProfileId (UUID de la femme)
 */
export async function getActualPartnerProfileId(): Promise<string | null> {
  const identity = await getIdentity();
  if (identity === 'woman') {
    return config.partnerProfileId || config.myProfileId || null;
  }
  if (identity === 'man') {
    return config.myProfileId || config.partnerProfileId || null;
  }
  return config.partnerProfileId || null;
}
