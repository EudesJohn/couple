// ============================================================
// Wrapper sécurisé pour expo-av — permet un fallback gracieux
// dans Expo Go où le module natif n'est pas disponible
// ============================================================

type AudioModule = any;

let _Audio: AudioModule | null | undefined = undefined;

/**
 * Vérifie si le module natif ExponentAV est disponible,
 * puis importe expo-av. Retourne null si pas disponible.
 * Le résultat est mis en cache après la première vérification.
 */
export function getAudio(): AudioModule | null {
  if (_Audio !== undefined) return _Audio;
  _Audio = null;

  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    const nativeAv = requireOptionalNativeModule('ExponentAV');

    if (!nativeAv) {
      _Audio = null;
      return null;
    }

    const mod = require('expo-av');
    if (mod && mod.Audio && typeof mod.Audio.setAudioModeAsync === 'function') {
      _Audio = mod;
      return _Audio;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Vérifie si expo-av est disponible (via le cache).
 */
export function isAudioAvailable(): boolean {
  return getAudio() !== null;
}
