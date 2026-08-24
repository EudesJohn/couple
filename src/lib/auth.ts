// ============================================================
// Auth — PIN + Biométrie (empreinte + visage)
// Stockage sécurisé via expo-secure-store
// Compatible Web + Mobile (imports dynamiques)
// ============================================================
import { Platform } from 'react-native';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';

// --- Identité (femme /homme) ---
export type UserIdentity = 'woman' | 'man';

// --- Clés SecureStore ---
const STORE_KEYS = {
  PIN_HASH: 'notre-bulle.pin-hash',
  BIOMETRIC_FINGERPRINT: 'notre-bulle.bio-fingerprint',
  BIOMETRIC_FACE: 'notre-bulle.bio-face',
  IS_SETUP_DONE: 'notre-bulle.setup-done',
  IDENTITY: 'notre-bulle.identity.v2',
} as const;

const isWeb = Platform.OS === 'web';

// --- Wrapper SecureStore compatible Web (import dynamique) ---
async function getSecureStore() {
  if (isWeb) return null;
  try {
    const mod = await import('expo-secure-store');
    return mod.default || mod;
  } catch { return null; }
}

async function secureGet(key: string): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(key);
  }
  try {
    const ss = await getSecureStore();
    if (!ss) return localStorage.getItem(key);
    return await ss.getItemAsync(key);
  } catch {
    return localStorage.getItem(key);
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(key, value);
    return;
  }
  try {
    const ss = await getSecureStore();
    if (ss) await ss.setItemAsync(key, value);
    else localStorage.setItem(key, value);
  } catch {
    localStorage.setItem(key, value);
  }
}

// --- Types ---
export interface BiometricPrefs {
  fingerprint: boolean;
  face: boolean;
}

export type BiometricType = 'fingerprint' | 'face' | 'iris';

// --- Hachage PIN (SHA-256) ---
export async function hashPin(pin: string): Promise<string> {
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `notre-bulle-salt-${pin}`
  );
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const computed = await hashPin(pin);
  return computed === hash;
}

// --- Stockage sécurisé du PIN ---
export async function savePinHash(hash: string): Promise<void> {
  await secureSet(STORE_KEYS.PIN_HASH, hash);
}

export async function getStoredPinHash(): Promise<string | null> {
  return secureGet(STORE_KEYS.PIN_HASH);
}

// --- Préférences biométriques ---
export async function saveBiometricPrefs(prefs: BiometricPrefs): Promise<void> {
  await secureSet(STORE_KEYS.BIOMETRIC_FINGERPRINT, prefs.fingerprint ? 'true' : 'false');
  await secureSet(STORE_KEYS.BIOMETRIC_FACE, prefs.face ? 'true' : 'false');
}

export async function getBiometricPrefs(): Promise<BiometricPrefs> {
  const fp = await secureGet(STORE_KEYS.BIOMETRIC_FINGERPRINT);
  const face = await secureGet(STORE_KEYS.BIOMETRIC_FACE);
  return {
    fingerprint: fp === 'true',
    face: face === 'true',
  };
}

// --- Flag setup terminé ---
export async function markSetupDone(): Promise<void> {
  await secureSet(STORE_KEYS.IS_SETUP_DONE, 'true');
}

export async function isSetupDone(): Promise<boolean> {
  const val = await secureGet(STORE_KEYS.IS_SETUP_DONE);
  return val === 'true';
}

// --- Vérification matérielle ---
export async function getHardwareBiometrics(): Promise<{
  hasHardware: boolean;
  isEnrolled: boolean;
  availableTypes: BiometricType[];
}> {
  if (isWeb) {
    return { hasHardware: false, isEnrolled: false, availableTypes: [] };
  }

  try {
    const LocalAuth = await import('expo-local-authentication');
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuth.hasHardwareAsync(),
      LocalAuth.isEnrolledAsync(),
      LocalAuth.supportedAuthenticationTypesAsync(),
    ]);

    const availableTypes: BiometricType[] = supportedTypes.map((t: number) => {
      switch (t) {
        case LocalAuth.AuthenticationType.FINGERPRINT:
          return 'fingerprint';
        case LocalAuth.AuthenticationType.FACIAL_RECOGNITION:
          return 'face';
        case LocalAuth.AuthenticationType.IRIS:
          return 'iris';
        default:
          return 'fingerprint';
      }
    });

    return { hasHardware, isEnrolled, availableTypes };
  } catch {
    return { hasHardware: false, isEnrolled: false, availableTypes: [] };
  }
}

// --- Authentification biométrique ---
export async function authenticateWithBiometrics(): Promise<boolean> {
  if (isWeb) return false;

  try {
    const LocalAuth = await import('expo-local-authentication');
    const { hasHardware, isEnrolled } = await getHardwareBiometrics();
    if (!hasHardware || !isEnrolled) return false;

    const result = await LocalAuth.authenticateAsync({
      promptMessage: 'Déverrouiller Notre Bulle',
      fallbackLabel: 'Utiliser le code PIN',
      cancelLabel: 'Annuler',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    return false;
  }
}

// --- Vérifier si le code PIN a déjà été défini ---
export async function isPinSet(): Promise<boolean> {
  return (await getStoredPinHash()) !== null;
}

// --- Identité (femme /homme) ---
export async function saveIdentity(role: UserIdentity): Promise<void> {
  await secureSet(STORE_KEYS.IDENTITY, role);
}

export async function getIdentity(): Promise<UserIdentity | null> {
  const val = await secureGet(STORE_KEYS.IDENTITY);
  if (val === 'woman' || val === 'man') return val;
  return null;
}

export async function isFirstIdentitySet(): Promise<boolean> {
  return (await getIdentity()) !== null;
}
