// ============================================================
// Auth Context — état global de l'authentification (PIN only)
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { isPinSet, isSetupDone, verifyPin, getStoredPinHash } from '../lib/auth';

interface AuthState {
  isLocked: boolean;
  isFirstLaunch: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lock: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(true);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  const checkAuth = useCallback(async () => {
    // 1. Connexion anonyme Supabase
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
    } catch (err) {
      console.warn('Supabase anon sign-in skipped:', err);
    }

    // 2. Vérifier si le PIN est défini
    const pinExists = await isPinSet();
    const setupDone = await isSetupDone();

    if (!pinExists) {
      // Premier lancement
      setIsFirstLaunch(true);
      setIsLocked(false);
      return;
    }

    if (pinExists && !setupDone) {
      // PIN défini mais setup pas terminé
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

  const lock = useCallback(() => {
    setIsLocked(true);
  }, []);

  return (
    <AuthContext.Provider value={{ isLocked, isFirstLaunch, unlockWithPin, lock, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
