// ============================================================
// Wrapper audio compatible Web + Mobile
// Fallback gracieux quand le module natif n'est pas disponible
// ============================================================

type AudioModule = any;

let _Audio: AudioModule | null | undefined = undefined;
let _isWeb = false;

try { _isWeb = typeof window !== 'undefined' && typeof window.document !== 'undefined'; } catch { _isWeb = true; }

/**
 * Vérifie si un module audio natif est disponible (expo-av sur mobile)
 * Sur le web, retourne null (on utilise l'API Web Audio native dans les hooks)
 */
export function getAudio(): AudioModule | null {
  if (_Audio !== undefined) return _Audio;
  _Audio = null;

  // Sur le web, expo-av n'est pas nécessaire — on utilise l'API Web Audio
  if (_isWeb) {
    return null;
  }

  // Sur mobile, essayer d'importer expo-av
  try {
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
 * Vérifie si un module audio est disponible (via le cache).
 */
export function isAudioAvailable(): boolean {
  return getAudio() !== null;
}

/**
 * API Audio Web — MediaRecorder pour l'enregistrement
 * Disponible uniquement sur le web
 */
export function isMediaRecorderAvailable(): boolean {
  if (!_isWeb) return false;
  return typeof navigator !== 'undefined' && 'mediaDevices' in navigator && 'MediaRecorder' in window;
}

/**
 * API Audio Web — AudioContext pour la lecture
 * Disponible uniquement sur le web
 */
export function getAudioContext(): AudioContext | null {
  if (!_isWeb) return null;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}
