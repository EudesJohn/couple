// ============================================================
// Sonnerie d'appel entrant — lecture en boucle tant que ça sonne
// « Son du téléphone » → rien ici (la notification système sonne).
// Sonnerie intégrée ou musique perso → boucle expo-av.
// ============================================================
import { useEffect } from 'react';
import { getStoredRingtone, playRingtoneLoop } from '../lib/ringtones';

export function useIncomingCallSound(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let stop: (() => Promise<void>) | null = null;

    (async () => {
      try {
        const stored = await getStoredRingtone();
        const stopFn = await playRingtoneLoop(stored);
        if (cancelled) {
          await stopFn();
          return;
        }
        stop = stopFn;
      } catch (err) {
        console.warn('[IncomingCallSound] erreur:', err);
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [active]);
}
