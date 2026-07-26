// ============================================================
// Auth Context — état global de l'authentification
// 1ʳᵉ connexion : codes préréglés 1234 (Femme) / 1235 (Homme)
// Connexions suivantes : vérification du PIN hashé
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  isPinSet, getStoredPinHash, verifyPin,
  hashPin, savePinHash, markSetupDone,
  isFirstLaunch, saveIdentity, getIdentity,
  PRESET_CODES, type UserIdentity,
} from '../lib/auth';

interface AuthState {
  isLocked: boolean;
  isFirstLaunch: boolean;
  identity: UserIdentity | null;
  unlockWithPin: (pin: string) => Promise<boolean>;
  setupFirstIdentity: (pin: string) => Promise<UserIdentity | null>;
  lock: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(true);
  const [isFirstLaunchState, setIsFirstLaunchState] = useState(false);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);

  const checkAuth = useCallback(async () => {
    // Vérifier si l'identité existe déjà (localStorage)
    const firstLaunch = await isFirstLaunch();
    if (firstLaunch) {
      setIsFirstLaunchState(true);
      setIsLocked(false);
      setIdentity(null);
      return;
    }

    // Identité existante → verrouillé
    setIsFirstLaunchState(false);
    setIsLocked(true);
    const storedIdentity = await getIdentity();
    setIdentity(storedIdentity);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /** Déverrouillage normal (PIN hashé) */
  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const stored = await isPinSet();
    if (!stored) return false;

    const hash = await getStoredPinHash();
    if (!hash) return false;

    const valid = await verifyPin(pin, hash);
    if (valid) {
      setIsLocked(false);
      return true;
    }
    return false;
  }, []);

  /**
   * Première connexion : un code préréglé (1234 / 1235)
   * identifie la personne et devient son PIN initial.
   */
  const setupFirstIdentity = useCallback(async (pin: string): Promise<UserIdentity | null> => {
    let role: UserIdentity | null = null;

    if (pin === PRESET_CODES.WOMAN) role = 'woman';
    else if (pin === PRESET_CODES.MAN) role = 'man';
    else return null;

    // Hacher le PIN + stocker
    const hash = await hashPin(pin);
    await savePinHash(hash);
    await saveIdentity(role);
    await markSetupDone();

    setIdentity(role);
    setIsFirstLaunchState(false);
    setIsLocked(false);
    return role;
  }, []);

  const lock = useCallback(() => {
    setIsLocked(true);
  }, []);

  return (
    <AuthContext.Provider value={{
      isLocked: isLocked,
      isFirstLaunch: isFirstLaunchState,
      identity,
      unlockWithPin,
      setupFirstIdentity,
      lock,
      checkAuth,
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
