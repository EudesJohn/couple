// ============================================================
// Vérification de la disponibilité de l'audio natif
// Migré vers expo-audio (expo-av supprimé en SDK 55+).
// ============================================================
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/**
 * Sur web : MediaRecorder disponible ?
 * Sur mobile : expo-audio est toujours disponible.
 */
export function isMediaRecorderAvailable(): boolean {
  if (!isWeb) return true;
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Vérifie que le module audio natif est disponible.
 * Avec expo-audio, le module natif est toujours présent dans un build
 * natif et dans Expo Go — la fonction ne sert qu'aux vérifications
 * défensives.
 */
export function getAudio(): any | null {
  if (isWeb) return null; // Web : API Web Audio du navigateur
  try {
    return require('expo-audio');
  } catch {
    return null;
  }
}
