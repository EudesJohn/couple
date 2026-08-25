// ============================================================
// Auth Context — état global de l'authentification
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  isPinSet,
  isSetupDone,
  verifyPin,
  authenticateWithBiometrics,
  getBiometricPrefs,
  getHardwareBiometrics,
  type BiometricPrefs,
  type BiometricType,
} from '../lib/auth';

/**
 * Lie le profil courant au compte Supabase Auth.
 * ⚠️ SÉCURITÉ (audit v3+) : la liaison exige désormais le PIN du couple
 * (vérifié côté serveur). Elle n'est donc appelée qu'APRÈS un déverrouillage
 * PIN réussi — jamais au démarrage, sinon n'importe qui pourrait
 * s'approprier un profil et contourner la RLS.
 */
async function linkProfileToAuth(pin: string): Promise<void> {
  try {
    const { getOwnProfileId } = await import('../lib/profile');
    const profileId = await getOwnProfileId();
    if (!profileId) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const { error } = await supabase.rpc('link_profile_to_auth', {
      p_profile_id: profileId,
      p_auth_user_id: session.user.id,
      p_pin: pin,
    });
    if (error) {
      console.warn('link_profile_to_auth error:', error.message);
    }
  } catch (err) {
    console.warn('linkProfileToAuth failed:', err);
  }
}

interface AuthState {
  isLocked: boolean;
  isFirstLaunch: boolean;
  biometricPrefs: BiometricPrefs;
  hardwareBiometrics: { hasHardware: boolean; isEnrolled: boolean; availableTypes: BiometricType[] };
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(true);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [biometricPrefs, setBiometricPrefs] = useState<BiometricPrefs>({
    fingerprint: false,
    face: false,
  });
  const [hardwareBiometrics, setHardwareBiometrics] = useState({
    hasHardware: false,
    isEnrolled: false,
    availableTypes: [] as BiometricType[],
  });

  // Vérifier l'état au montage + connexion Supabase anonyme
  const checkAuth = useCallback(async () => {
    // 1. Connexion anonyme Supabase (nécessaire pour RLS Storage/DB).
    // ⚠️ SÉCURITÉ : on ne lie PLUS le profil ici — la liaison se fait
    // uniquement après vérification du PIN (voir linkProfileToAuth).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
    } catch (err) {
      console.warn('Supabase anon sign-in skipped:', err);
    }

    // 2. État PIN / biométrie
    const pinExists = await isPinSet();
    const setupDone = await isSetupDone();
    const prefs = await getBiometricPrefs();
    const hardware = await getHardwareBiometrics();

    setBiometricPrefs(prefs);
    setHardwareBiometrics(hardware);

    // Premier lancement : aucun PIN défini
    if (!pinExists) {
      setIsFirstLaunch(true);
      setIsLocked(false);
      return;
    }

    // Setup PIN fait mais pas les biométries → proposer
    if (pinExists && !setupDone) {
      setIsFirstLaunch(true);
      setIsLocked(false);
      return;
    }

    // PIN défini → verrouillé
    setIsFirstLaunch(false);
    setIsLocked(true);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Déverrouillage par PIN
  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const stored = await isPinSet();
    if (!stored) return false;

    // Récupérer le hash stocké
    const { getStoredPinHash } = await import('../lib/auth');
    const hash = await getStoredPinHash();
    if (!hash) return false;

    const valid = await verifyPin(pin, hash);
    if (valid) {
      setIsLocked(false);
      // Lier le profil au compte auth (RLS) — PIN validé localement
      await linkProfileToAuth(pin);
      return true;
    }
    return false;
  }, []);

  // Déverrouillage par biométrie
  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    const prefs = await getBiometricPrefs();
    if (!prefs.fingerprint && !prefs.face) return false;

    const success = await authenticateWithBiometrics();
    if (success) {
      setIsLocked(false);
    }
    return success;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLocked,
        isFirstLaunch,
        biometricPrefs,
        hardwareBiometrics,
        unlockWithPin,
        unlockWithBiometrics,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
