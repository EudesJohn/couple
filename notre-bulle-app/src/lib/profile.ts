// ============================================================
// Résolution dynamique des IDs de profil selon l'identité
// Même logique que notre-bulle-web/src/lib/profile.ts
//
// Convention des variables d'environnement :
//   extra.myProfileId     = UUID de la femme
//   extra.partnerProfileId = UUID de l'homme
//
// getMyProfileId() et getPartnerProfileId() gardent le mapping
// HISTORIQUE (inversé) pour être rétrocompatibles avec les
// anciens messages et entrées de cycle déjà en base.
//
// Pour les photos, utiliser getOwnProfileId() et
// getActualPartnerProfileId() qui ont le mapping correct.
// ============================================================
import { config } from '../constants/config';
import { getIdentity, type UserIdentity } from './auth';

const IDENTITY_KEY = 'notre-bulle.identity.v2';

async function getStoredIdentity(): Promise<UserIdentity | null> {
  const val = await getIdentity();
  return val;
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
export async function getMyProfileId(): Promise<string | null> {
  const identity = await getStoredIdentity();
  if (identity === 'woman') {
    return config.partnerProfileId || config.myProfileId || null;
  }
  if (identity === 'man') {
    return config.myProfileId || config.partnerProfileId || null;
  }
  return config.myProfileId || null;
}

/**
 * getPartnerProfileId — retourne le "profil partenaire" pour les messages.
 *
 * ⚠️ Mapping HISTORIQUE (inversé) :
 *   femme → myProfileId (UUID de la femme)
 *   homme → partnerProfileId (UUID de l'homme)
 */
export async function getPartnerProfileId(): Promise<string | null> {
  const identity = await getStoredIdentity();
  if (identity === 'woman') {
    return config.myProfileId || config.partnerProfileId || null;
  }
  if (identity === 'man') {
    return config.partnerProfileId || config.myProfileId || null;
  }
  return config.partnerProfileId || null;
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
export async function getOwnProfileId(): Promise<string | null> {
  const identity = await getStoredIdentity();
  if (identity === 'woman') {
    return config.myProfileId || config.partnerProfileId || null;
  }
  if (identity === 'man') {
    return config.partnerProfileId || config.myProfileId || null;
  }
  return config.myProfileId || null;
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
export async function getActualPartnerProfileId(): Promise<string | null> {
  const identity = await getStoredIdentity();
  if (identity === 'woman') {
    return config.partnerProfileId || config.myProfileId || null;
  }
  if (identity === 'man') {
    return config.myProfileId || config.partnerProfileId || null;
  }
  return config.partnerProfileId || null;
}
