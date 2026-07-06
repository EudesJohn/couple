// ============================================================
// Auth — PIN + Biométrie (empreinte + visage)
// Stockage sécurisé via expo-secure-store
// ============================================================
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';

// --- Clés SecureStore ---
const STORE_KEYS = {
  PIN_HASH: 'notre-bulle:pin-hash',
  BIOMETRIC_FINGERPRINT: 'notre-bulle:bio-fingerprint',
  BIOMETRIC_FACE: 'notre-bulle:bio-face',
  IS_SETUP_DONE: 'notre-bulle:setup-done',
} as const;

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
  await SecureStore.setItemAsync(STORE_KEYS.PIN_HASH, hash);
}

export async function getStoredPinHash(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORE_KEYS.PIN_HASH);
  } catch {
    return null;
  }
}

// --- Préférences biométriques ---
export async function saveBiometricPrefs(prefs: BiometricPrefs): Promise<void> {
  await SecureStore.setItemAsync(
    STORE_KEYS.BIOMETRIC_FINGERPRINT,
    prefs.fingerprint ? 'true' : 'false'
  );
  await SecureStore.setItemAsync(
    STORE_KEYS.BIOMETRIC_FACE,
    prefs.face ? 'true' : 'false'
  );
}

export async function getBiometricPrefs(): Promise<BiometricPrefs> {
  const fp = await SecureStore.getItemAsync(STORE_KEYS.BIOMETRIC_FINGERPRINT);
  const face = await SecureStore.getItemAsync(STORE_KEYS.BIOMETRIC_FACE);
  return {
    fingerprint: fp === 'true',
    face: face === 'true',
  };
}

// --- Flag setup terminé ---
export async function markSetupDone(): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEYS.IS_SETUP_DONE, 'true');
}

export async function isSetupDone(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(STORE_KEYS.IS_SETUP_DONE)) === 'true';
  } catch {
    return false;
  }
}

// --- Vérification matérielle ---
export async function getHardwareBiometrics(): Promise<{
  hasHardware: boolean;
  isEnrolled: boolean;
  availableTypes: BiometricType[];
}> {
  const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  const availableTypes: BiometricType[] = supportedTypes.map((t) => {
    switch (t) {
      case LocalAuthentication.AuthenticationType.FINGERPRINT:
        return 'fingerprint';
      case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
        return 'face';
      case LocalAuthentication.AuthenticationType.IRIS:
        return 'iris';
      default:
        return 'fingerprint';
    }
  });

  return { hasHardware, isEnrolled, availableTypes };
}

// --- Authentification biométrique ---
export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const { hasHardware, isEnrolled } = await getHardwareBiometrics();
    if (!hasHardware || !isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
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
