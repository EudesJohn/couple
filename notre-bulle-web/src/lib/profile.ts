// ============================================================
// Résolution dynamique des IDs de profil selon l'identité
// L'app est utilisée par les 2 partenaires sur le même téléphone
// L'identité (woman/man) est stockée dans localStorage via le PIN
//
// Convention des variables d'environnement :
//   VITE_MY_PROFILE_ID     = UUID de la femme
//   VITE_PARTNER_PROFILE_ID = UUID de l'homme
//
// getMyProfileId() et getPartnerProfileId() gardent le mapping
// HISTORIQUE (inversé) pour être rétrocompatibles avec les
// anciens messages et entrées de cycle déjà en base.
//
// Pour les photos, utiliser getOwnProfileId() et
// getActualPartnerProfileId() qui ont le mapping correct.
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
 * getMyProfileId — retourne le "profil courant" pour les messages.
 *
 * ⚠️ Mapping HISTORIQUE (inversé) :
 *   femme → partnerProfileId (UUID de l'homme)
 *   homme → myProfileId (UUID de la femme)
 *
 * Les anciens messages et le cycle ont été sauvegardés avec ce
 * mapping. On ne peut pas le changer sans casser l'alignement.
 */
export function getMyProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    return config.partnerProfileId || config.myProfileId || '';
  }
  return config.myProfileId || config.partnerProfileId || '';
}

/**
 * getPartnerProfileId — retourne le "profil partenaire" pour les messages.
 *
 * ⚠️ Mapping HISTORIQUE (inversé) :
 *   femme → myProfileId (UUID de la femme)
 *   homme → partnerProfileId (UUID de l'homme)
 */
export function getPartnerProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    return config.myProfileId || config.partnerProfileId || '';
  }
  return config.partnerProfileId || config.myProfileId || '';
}

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
export function getOwnProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    return config.myProfileId || config.partnerProfileId || '';
  }
  return config.partnerProfileId || config.myProfileId || '';
}

/**
 * getActualPartnerProfileId — retourne le VRAI profil du partenaire.
 *
 * Mapping correct :
 *   femme → partnerProfileId (UUID de l'homme)
 *   homme → myProfileId (UUID de la femme)
 *
 * ✅ Utiliser pour l'AFFICHAGE de l'avatar du partenaire.
 */
export function getActualPartnerProfileId(): string {
  const identity = getStoredIdentity();
  if (identity === 'woman') {
    return config.partnerProfileId || config.myProfileId || '';
  }
  return config.myProfileId || config.partnerProfileId || '';
}
