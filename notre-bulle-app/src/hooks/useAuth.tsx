// ============================================================
// Auth Context — état global de l'authentification
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  saveLastUnlock,
  getLastUnlock,
  saveSessionEpoch,
  getSessionEpoch,
  authenticateWithBiometrics,
  getBiometricPrefs,
  getHardwareBiometrics,
  saveTempPin,
  getTempPin,
  clearTempPin,
  LOCK_WINDOW_MS,
  type BiometricPrefs,
} from '../lib/auth';

function normalizeRpcRow(data: unknown): Record<string, any> | null {
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === 'object') return data as Record<string, any>;
  return null;
}

/**
 * Lie le profil courant au compte Supabase Auth.
 */
async function linkProfileToAuth(pin: string): Promise<boolean> {
  try {
    const { getOwnProfileId } = await import('../lib/profile');
    const profileId = await getOwnProfileId();
    console.log('🔗 linkProfileToAuth — profileId:', profileId);
    if (!profileId) {
      console.warn('🔗 linkProfileToAuth: pas de profileId');
      return false;
    }

    const { data: { session } } = await supabase.auth.getSession();
    let authUserId = session?.user?.id;
    console.log('🔗 linkProfileToAuth — auth user:', authUserId ?? 'NONE');

    if (!authUserId) {
      console.warn('🔗 pas de session — tentative signInAnonymously...');
      const { data, error: signInErr } = await supabase.auth.signInAnonymously();
      if (signInErr || !data?.user?.id) {
        console.warn('🔗 signInAnonymously echoue:', signInErr?.message);
        return false;
      }
      authUserId = data.user.id;
      console.log('🔗 nouvelle session anon:', authUserId);
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('link_profile_to_auth', {
      p_profile_id: profileId,
      p_auth_user_id: authUserId,
      p_pin: pin,
    });
    const row = normalizeRpcRow(rpcData);
    if (rpcErr || !row?.ok) {
      console.warn('🔗 link_profile_to_auth FAILED:', rpcErr?.message || row?.error || 'unknown');
      return false;
    }
    console.log('🔗 Lien profile→auth reussi ✅');
    return true;
  } catch (err: any) {
    console.warn('🔗 linkProfileToAuth EXCEPTION:', err?.message || err);
    return false;
  }
}

export type AuthStatus = 'loading' | 'onboarding' | 'setupPin' | 'locked' | 'unlocked';

interface AuthState {
  status: AuthStatus;
  identity: 'woman' | 'man' | null;
  isLocked: boolean;
  isFirstLaunch: boolean;
  authError: string | null;
  biometricPrefs: BiometricPrefs;
  hardwareBiometrics: { hasHardware: boolean; isEnrolled: boolean; availableTypes: any[] };
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  createPinOnServer: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  changePinOnServer: (oldPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [identity, setIdentity] = useState<'woman' | 'man' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [biometricPrefs, setBiometricPrefs] = useState<BiometricPrefs>({ fingerprint: false, face: false });
  const [hardwareBiometrics, setHardwareBiometrics] = useState({ hasHardware: false, isEnrolled: false, availableTypes: [] as any[] });

  const callRpc = useCallback(async (fn: string, args: Record<string, unknown>): Promise<Record<string, any> | null> => {
    const res = await supabase.rpc(fn, args);
    if (res.error) throw new Error(res.error.message || 'Erreur serveur');
    return normalizeRpcRow(res.data);
  }, []);

  const checkAuth = useCallback(async () => {
    // 0. Session anon Supabase
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
    } catch (err) {
      console.warn('Supabase anon sign-in skipped:', err);
    }

    // 1. Identite
    const { getIdentity } = await import('../lib/auth');
    const identity = await getIdentity();
    const prefs = await getBiometricPrefs();
    const hardware = await getHardwareBiometrics();
    setBiometricPrefs(prefs);
    setHardwareBiometrics(hardware);
    if (!identity) { setStatus('onboarding'); return; }
    setIdentity(identity);

    // 2. Etat du PIN cote serveur
    try {
      const { getOwnProfileId } = await import('../lib/profile');
      const profileId = await getOwnProfileId();
      if (!profileId) { setAuthError('Profil non configure'); setStatus('locked'); return; }

      const row = await callRpc('get_couple_auth_state', { p_profile_id: profileId });
      if (!row || row.has_pin === undefined) throw new Error('Reponse inattendue');

      if (!row.has_pin) { setStatus('setupPin'); return; }

      const localEpoch = await getSessionEpoch();
      const lastUnlock = await getLastUnlock();
      const withinWindow = lastUnlock !== null && Date.now() - lastUnlock < LOCK_WINDOW_MS;

      if (localEpoch === null || Number(row.session_epoch) !== localEpoch) {
        setStatus('locked');
        return;
      }

      // Auto-unlock : relier le profil AVANT deverrouiller
      const tempPin = await getTempPin();
      if (tempPin) {
        console.log('🔗 Auto-unlock: re-link profile...');
        await linkProfileToAuth(tempPin);
      }
      setStatus('unlocked');
    } catch (err: any) {
      setAuthError(err?.message || 'Erreur connexion');
      setStatus('locked');
    }
  }, [callRpc]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // ─── Unlock par PIN ───
  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const { getOwnProfileId } = await import('../lib/profile');
      const profileId = await getOwnProfileId();
      if (!profileId) return false;

      const row = await callRpc('login_couple_pin', { p_profile_id: profileId, p_pin: pin });
      if (!row?.ok) return false;

      await saveSessionEpoch(Number(row.session_epoch));
      await saveLastUnlock();
      await saveTempPin(pin);

      const linked = await linkProfileToAuth(pin);
      if (!linked) console.warn('⚠️ unlock ok mais lien auth echoue');

      setStatus('unlocked');
      return true;
    } catch (err) {
      console.warn('unlockWithPin:', err);
      return false;
    }
  }, [callRpc]);

  // ─── Unlock biométrique ───
  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    const prefs = await getBiometricPrefs();
    if (!prefs.fingerprint && !prefs.face) return false;
    const lastUnlock = await getLastUnlock();
    if (lastUnlock === null || Date.now() - lastUnlock >= LOCK_WINDOW_MS) return false;
    const success = await authenticateWithBiometrics();
    if (success) {
      await saveLastUnlock();
      const tempPin = await getTempPin();
      if (tempPin) await linkProfileToAuth(tempPin);
      setStatus('unlocked');
    }
    return success;
  }, []);

  // ─── Creation PIN ───
  const createPinOnServer = useCallback(async (pin: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { getOwnProfileId } = await import('../lib/profile');
      const profileId = await getOwnProfileId();
      if (!profileId) return { ok: false, error: 'Profil non configure' };

      const row = await callRpc('set_couple_pin', { p_profile_id: profileId, p_pin: pin });
      if (!row?.ok) return { ok: false, error: 'Ce profil a deja un code secret' };

      await saveSessionEpoch(Number(row.session_epoch));
      await saveLastUnlock();
      await saveTempPin(pin);
      await linkProfileToAuth(pin);
      setStatus('unlocked');
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Erreur serveur' };
    }
  }, [callRpc]);

  // ─── Changement PIN ───
  const changePinOnServer = useCallback(async (oldPin: string, newPin: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { getOwnProfileId } = await import('../lib/profile');
      const profileId = await getOwnProfileId();
      if (!profileId) return { ok: false, error: 'Profil non configure' };

      const row = await callRpc('change_couple_pin', { p_profile_id: profileId, p_old_pin: oldPin, p_new_pin: newPin });
      if (!row?.ok) return { ok: false, error: 'Ancien code incorrect' };

      await saveSessionEpoch(Number(row.session_epoch));
      await saveLastUnlock();
      await saveTempPin(newPin);
      await linkProfileToAuth(newPin);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Erreur serveur' };
    }
  }, [callRpc]);

  // ─── Deconnexion ───
  const logout = useCallback(async () => {
    await clearTempPin();
    setStatus('locked');
  }, []);

  // ─── Enregistrement du token push Expo (notifications app fermee) ───
  useEffect(() => {
    if (status !== 'unlocked') return;
    let cancelled = false;
    (async () => {
      try {
        const { getOwnProfileId } = await import('../lib/profile');
        const profileId = await getOwnProfileId();
        if (!profileId || cancelled) return;
        const { registerExpoPushToken } = await import('./useNotifications');
        await registerExpoPushToken(profileId);
      } catch (err) {
        console.warn('⚠️ Push token:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [status]);

  return (
    <AuthContext.Provider value={      { status, identity, isLocked: status === 'loading' || status === 'locked',
      isFirstLaunch: status === 'onboarding' || status === 'setupPin',
      authError, biometricPrefs, hardwareBiometrics,
      unlockWithPin, unlockWithBiometrics, createPinOnServer, changePinOnServer,
      checkAuth, logout,
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
