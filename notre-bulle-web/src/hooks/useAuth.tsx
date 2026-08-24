// ============================================================
// Auth Context — état global de l'authentification
//
// 🔐 Le PIN est vérifié côté SERVEUR (fonctions RPC Supabase).
//    Aucun mot de passe n'est stocké en local.
//
// Statuts :
//   - onboarding : 1ʳᵉ connexion, confirmation du profil par UUID
//   - setupPin    : aucun PIN en base pour ce profil → création
//                  (bootstrap du 1er appareil)
//   - locked      : verrouillé (> 24 h, verrou manuel, OU un autre
//                  appareil s'est connecté → déconnexion forcée)
//   - unlocked    : ouvert (dans la fenêtre de 24 h)
//
// L'app reste déverrouillée tant que 24 h ne se sont pas écoulées.
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  saveIdentity, getIdentity, resetIdentity,
  saveLastUnlock, getLastUnlock, resetAuth,
  saveSessionEpoch, getSessionEpoch,
  LOCK_WINDOW_MS, type UserIdentity,
} from '../lib/auth';
import { clearProfileCache } from '../lib/cache';
import { supabase } from '../lib/supabase';
import { config } from '../constants/config';
import { getOwnProfileId } from '../lib/profile';
import { requestNotificationPermission } from './useNotifications';

export type AuthStatus = 'loading' | 'onboarding' | 'setupPin' | 'locked' | 'unlocked';

interface AuthState {
  status: AuthStatus;
  identity: UserIdentity | null;
  authError: string | null;
  confirmProfile: (uuid: string) => Promise<{ ok: boolean; error?: string }>;
  setPin: (pin: string) => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lock: () => void;
  disconnect: () => Promise<void>;
  switchProfile: () => void;
  checkAuth: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Les fonctions RPC renvoient un tableau de lignes ({ ok, has_pin, session_epoch }). */
type RpcRow = { ok?: boolean; has_pin?: boolean; session_epoch?: number } | null | undefined;

function normalizeRow(data: unknown): RpcRow {
  if (Array.isArray(data)) return (data[0] ?? null) as RpcRow;
  return (data ?? null) as RpcRow;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  /** Appelle une fonction RPC Supabase et normalise la réponse. */
  const callRpc = useCallback(async (fn: string, args: Record<string, unknown>): Promise<RpcRow> => {
    const res = await supabase.rpc(fn, args);
    if (res.error) throw new Error(res.error.message || 'Erreur serveur');
    return normalizeRow(res.data);
  }, []);

  /**
   * Lie le profil courant au compte Supabase Auth.
   * Appelé après signInAnonymously() pour que les politiques RLS
   * puissent utiliser auth.uid() pour identifier l'utilisateur.
   */
  const linkProfileToAuth = useCallback(async (authUserId: string) => {
    try {
      const profileId = getOwnProfileId();
      if (!profileId) return;
      const { error } = await supabase.rpc('link_profile_to_auth', {
        p_profile_id: profileId,
        p_auth_user_id: authUserId,
      });
      if (error) console.warn('link_profile_to_auth error:', error.message);
    } catch (err) {
      console.warn('linkProfileToAuth failed:', err);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    // 0. Connexion anonyme Supabase (nécessaire pour RLS)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (data?.user && !error) {
          await linkProfileToAuth(data.user.id);
        }
      } else if (session.user) {
        await linkProfileToAuth(session.user.id);
      }
    } catch (err) {
      console.warn('Supabase anon sign-in skipped:', err);
    }

    const storedIdentity = await getIdentity();
    if (!storedIdentity) {
      // Aucune identité → onboarding (confirmation du profil)
      setIdentity(null);
      setStatus('onboarding');
      return;
    }

    setIdentity(storedIdentity);
    const profileId = getOwnProfileId();
    if (!profileId) {
      setAuthError('Profil non configuré (identité introuvable)');
      setStatus('locked');
      return;
    }

    try {
      const row = await callRpc('get_couple_auth_state', { p_profile_id: profileId });
      if (!row || row.has_pin === undefined) throw new Error('Réponse inattendue');

      if (!row.has_pin) {
        // Aucun PIN en base pour ce profil → premier appareil : création
        setAuthError(null);
        setStatus('setupPin');
        return;
      }

      // Un PIN existe → il faut le saisir.
      const localEpoch = await getSessionEpoch();
      const lastUnlock = await getLastUnlock();
      const withinWindow = lastUnlock !== null && (Date.now() - lastUnlock) < LOCK_WINDOW_MS;

      // Déconnexion forcée : si l'epoch local est périmé, un autre
      // appareil s'est connecté depuis → verrouillé.
      if (localEpoch === null || row.session_epoch !== localEpoch) {
        setAuthError(null);
        setStatus('locked');
        return;
      }

      setAuthError(null);
      setStatus(withinWindow ? 'unlocked' : 'locked');
    } catch (err: any) {
      setAuthError(err?.message || 'Connexion impossible — vérifie ta connexion internet');
      setStatus('locked');
    }
  }, [callRpc]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Étape 1 de l'onboarding : confirmation du profil par UUID.
   * L'UUID doit correspondre à l'un des deux profils configurés
   * (VITE_MY_PROFILE_ID / VITE_PARTNER_PROFILE_ID) ET exister en base.
   * Ensuite on interroge le serveur : PIN existant → locked (à saisir),
   * sinon → setupPin (création).
   */
  const confirmProfile = useCallback(async (uuid: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = uuid.trim().toLowerCase();
    if (!trimmed) return { ok: false, error: 'Entre l’UUID de ton profil' };

    let role: UserIdentity | null = null;
    if (config.myProfileId && trimmed === config.myProfileId.toLowerCase()) role = 'woman';
    else if (config.partnerProfileId && trimmed === config.partnerProfileId.toLowerCase()) role = 'man';

    if (!role) {
      return { ok: false, error: 'UUID inconnu · il ne correspond à aucun profil configuré' };
    }

    // Vérifier que le profil existe bien en base
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', trimmed)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, error: 'Profil introuvable en base' };
    } catch {
      return { ok: false, error: 'Impossible de vérifier le profil (connexion ?)' };
    }

    await saveIdentity(role);
    setIdentity(role);

    const profileId = getOwnProfileId();
    if (!profileId) {
      resetAuth();
      setIdentity(null);
      return { ok: false, error: 'Profil non configuré' };
    }

    try {
      const row = await callRpc('get_couple_auth_state', { p_profile_id: profileId });
      setStatus(row && row.has_pin ? 'locked' : 'setupPin');
      return { ok: true };
    } catch (err: any) {
      // Si on ne peut pas joindre le serveur, on annule l'étape pour
      // permettre une nouvelle tentative (identité retirée).
      resetAuth();
      setIdentity(null);
      setStatus('onboarding');
      return { ok: false, error: err?.message || 'Connexion impossible — vérifie ta connexion internet' };
    }
  }, [callRpc]);

  /** Étape 2 de l'onboarding : création du PIN en base (bootstrap). */
  const setPin = useCallback(async (pin: string): Promise<boolean> => {
    const profileId = getOwnProfileId();
    if (!profileId) return false;
    if (!/^\d{4}$/.test(pin)) return false;

    try {
      const row = await callRpc('set_couple_pin', { p_profile_id: profileId, p_pin: pin });
      if (!row?.ok) return false;
      await saveSessionEpoch(row.session_epoch ?? 0);
      await saveLastUnlock();
      clearProfileCache();
      setAuthError(null);
      setStatus('unlocked');
      return true;
    } catch (err: any) {
      setAuthError(err?.message || 'Erreur lors de l’enregistrement du code');
      return false;
    }
  }, [callRpc]);

  /** Déverrouillage : le PIN est vérifié côté serveur. */
  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const profileId = getOwnProfileId();
    if (!profileId) return false;

    try {
      const row = await callRpc('login_couple_pin', { p_profile_id: profileId, p_pin: pin });
      if (!row?.ok) return false;
      await saveSessionEpoch(row.session_epoch ?? 0);
      await saveLastUnlock();
      clearProfileCache();
      setAuthError(null);
      setStatus('unlocked');
      return true;
    } catch (err: any) {
      setAuthError(err?.message || 'Connexion impossible — vérifie ta connexion internet');
      return false;
    }
  }, [callRpc]);

  /** Verrouillage manuel (bouton « Verrouiller maintenant »). */
  const lock = useCallback(() => {
    setStatus('locked');
  }, []);

  /** Déconnexion : efface l'identité et la session → retour à l'onboarding. */
  const disconnect = useCallback(async () => {
    resetAuth();
    clearProfileCache();
    setIdentity(null);
    setAuthError(null);
    setStatus('onboarding');
  }, []);

  /** Change de profil : efface uniquement l'identité pour revenir
   *  au choix "Elle / Lui". Le PIN reste enregistré. */
  const switchProfile = useCallback(() => {
    resetIdentity();
    setIdentity(null);
    setAuthError(null);
    setStatus('onboarding');
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // === Verrouillage automatique après 24 h + déconnexion forcée ===
  // Tant que l'app est déverrouillée, on vérifie périodiquement :
  //   1. la fenêtre de 24 h (écoulée → verrouillage),
  //   2. l'epoch de session serveur (un autre appareil s'est connecté
  //      → déconnexion forcée).
  useEffect(() => {
    if (status !== 'unlocked') return;

    const check = async () => {
      const last = await getLastUnlock();
      if (last !== null && (Date.now() - last) >= LOCK_WINDOW_MS) {
        setStatus('locked');
        return;
      }
      const profileId = getOwnProfileId();
      const localEpoch = await getSessionEpoch();
      if (!profileId || localEpoch === null) return;
      try {
        const row = await callRpc('get_couple_auth_state', { p_profile_id: profileId });
        if (row && row.session_epoch !== undefined && row.session_epoch !== localEpoch) {
          setStatus('locked');
        }
      } catch {
        // réseau indisponible → on ignore, la fenêtre 24 h s'applique
      }
    };

    const interval = setInterval(check, 60_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [status, callRpc]);

  // === Enregistrement push dès que l'identité est valide ===
  // Le push a besoin d'un profileId résolu (identité confirmée) :
  // au statut « unlocked » il est garanti, donc les notifications
  // finissent par s'enregistrer correctement.
  useEffect(() => {
    if (status !== 'unlocked') return;
    requestNotificationPermission().catch(() => {});
  }, [status]);

  return (
    <AuthContext.Provider value={{
      status,
      identity,
      authError,
      confirmProfile,
      setPin,
      unlockWithPin,
      lock,
      disconnect,
      switchProfile,
      checkAuth,
      clearAuthError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
