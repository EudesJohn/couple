// ============================================================
// Wrapper audio — Web API (MediaRecorder / AudioContext)
// ============================================================

type AudioModule = any;

let _Audio: AudioModule | null | undefined = undefined;

/**
 * Sur le web, retourne null — on utilise l'API Web Audio native.
 */
export function getAudio(): AudioModule | null {
  if (_Audio !== undefined) return _Audio;
  _Audio = null;
  return null;
}

/**
 * Vérifie si un module audio est disponible.
 */
export function isAudioAvailable(): boolean {
  return getAudio() !== null;
}

/**
 * MediaRecorder disponible sur le web
 */
export function isMediaRecorderAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'mediaDevices' in navigator && 'MediaRecorder' in window;
}

/**
 * AudioContext pour la lecture
 */
export function getAudioContext(): AudioContext | null {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}
