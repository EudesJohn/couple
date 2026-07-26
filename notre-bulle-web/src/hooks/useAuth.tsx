// ============================================================
// Auth Context — état global de l'authentification
// 1ʳᵉ connexion : codes préréglés 1234 (Femme) / 1235 (Homme)
// Connexions suivantes : vérification du PIN hashé
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  isPinSet, verifyPin,
  hashPin, savePinHashForRole, markSetupDone,
  isFirstLaunch, saveIdentity, getIdentity,
  getStoredPinHashForRole,
  PRESET_CODES, type UserIdentity,
} from '../lib/auth';
import { clearProfileCache } from '../lib/cache';

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

    // Essayer chaque rôle (femme → homme)
    // getStoredPinHashForRole tient compte de la migration :
    // l'ancienne clé unique PIN_HASH est attribuée au rôle qui
    // a fait la 1ʳᵉ configuration (via notre-bulle.identity)
    for (const role of ['woman', 'man'] as UserIdentity[]) {
      const hash = await getStoredPinHashForRole(role);
      if (!hash) continue;

      const valid = await verifyPin(pin, hash);
      if (valid) {
        // Identité détectée → mettre à jour
        await saveIdentity(role);
        await markSetupDone();
        setIdentity(role);
        clearProfileCache();
        setIsLocked(false);
        return true;
      }
    }

    // Aucun hash existant n'a matché → peut-être que c'est la 1ʳᵉ
    // connexion de l'autre personne (ex: femme arrive après que
    // l'homme ait configuré l'app). On vérifie si c'est un code
    // préréglé valide pour un rôle qui n'a pas encore de hash.
    if (pin === PRESET_CODES.WOMAN) {
      const womanHash = await getStoredPinHashForRole('woman');
      if (!womanHash) {
        // La femme n'a pas encore de hash → auto-setup
        const newHash = await hashPin(pin);
        await savePinHashForRole('woman', newHash);
        await saveIdentity('woman');
        await markSetupDone();
        setIdentity('woman');
        clearProfileCache();
        setIsLocked(false);
        return true;
      }
    }
    if (pin === PRESET_CODES.MAN) {
      const manHash = await getStoredPinHashForRole('man');
      if (!manHash) {
        // L'homme n'a pas encore de hash → auto-setup
        const newHash = await hashPin(pin);
        await savePinHashForRole('man', newHash);
        await saveIdentity('man');
        await markSetupDone();
        setIdentity('man');
        clearProfileCache();
        setIsLocked(false);
        return true;
      }
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

    // Hacher le PIN + stocker (par rôle)
    clearProfileCache();
    const hash = await hashPin(pin);
    await savePinHashForRole(role, hash);
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
