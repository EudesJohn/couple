// ============================================================
// Sonneries d'appel & notifications
// Sources possibles :
//   • « default »      → son du téléphone (canal système)
//   • sonneries intégrées (WAV générés, ~200 Ko chacun)
//   • musique perso    → fichier choisi par l'utilisateur (URI local)
//
// Les fichiers WAV intégrés sont aussi copiés en ressources natives
// par le plugin expo-notifications → ils fonctionnent comme son de
// NOTIFICATION système (app fermée). La musique perso ne peut pas
// devenir une ressource système : elle sonne quand l'app est ouverte/
// en arrière-plan, sinon le son système du canal est utilisé.
// ============================================================
import { Platform } from 'react-native';

export const DEFAULT_RINGTONE = 'default';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bulleDouce = require('../../assets/sounds/bulle_douce.wav');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const coeurBat = require('../../assets/sounds/coeur_bat.wav');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const carillonOr = require('../../assets/sounds/carillon_or.wav');

export interface Ringtone {
  id: string;
  label: string;
  /** Asset JS intégré (null = son du téléphone) */
  asset: number | null;
}

export const RINGTONES: Ringtone[] = [
  { id: DEFAULT_RINGTONE, label: 'Son du téléphone', asset: null },
  { id: 'bulle_douce', label: 'Bulle douce', asset: bulleDouce },
  { id: 'coeur_bat', label: 'Battement', asset: coeurBat },
  { id: 'carillon_or', label: "Carillon d'or", asset: carillonOr },
];

/** Valeur stockée : soit un id connu, soit une URI `file:` de musique perso. */
export function isCustomMusic(value: string | null): boolean {
  return !!value && (value.startsWith('file:') || value.startsWith('content:'));
}

export async function getStoredRingtone(): Promise<string> {
  const { getSetting } = await import('./settings');
  return (await getSetting('ringtone')) || DEFAULT_RINGTONE;
}

/**
 * Résout la valeur stockée en source jouable :
 *   • URI perso        → la même URI (string)
 *   • sonnerie intégrée→ asset require (number)
 *   • son du téléphone → null (le canal de notification s'en charge)
 */
export function resolveRingtoneSource(stored: string): string | number | null {
  if (isCustomMusic(stored)) return stored;
  const rt = RINGTONES.find((r) => r.id === stored);
  return rt?.asset ?? null;
}

/**
 * Sauvegarde le choix ET recrée le canal « calls » Android avec le son
 * correspondant (le son d'un canal existant ne peut pas être modifié).
 * Musique perso → impossible en ressource système : le canal garde le
 * son du téléphone, la perso joue quand l'app tourne.
 * Retourne un message d'info éventuel à afficher à l'utilisateur.
 */
export async function applyRingtone(value: string): Promise<string | null> {
  const { setSetting } = await import('./settings');
  await setSetting('ringtone', value);

  let infoMessage: string | null = null;
  if (isCustomMusic(value)) {
    infoMessage =
      'Ta musique sonnera quand Notre Bulle est ouverte ou en arrière-plan. ' +
      'Quand elle est fermée, ce sera le son du téléphone.';
  }

  if (Platform.OS !== 'android') return infoMessage;

  // Ressource native possible uniquement pour les sonneries intégrées
  const nativeName =
    isCustomMusic(value) || value === DEFAULT_RINGTONE ? undefined : `${value}.wav`;

  try {
    const N = await import('expo-notifications');
    await N.deleteNotificationChannelAsync('calls');
    await N.setNotificationChannelAsync('calls', {
      name: 'Appels',
      description: 'Appels entrants et notifications',
      importance: N.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300, 200, 600],
      lightColor: '#CA8A04',
      ...(nativeName ? { sound: nativeName } : {}),
      enableVibrate: true,
      showBadge: true,
    });
  } catch (err) {
    console.warn('[Ringtones] Mise à jour du canal impossible:', err);
  }

  return infoMessage;
}

/**
 * Joue la sonnerie en BOUCLE (appel entrant / aperçu).
 * Retourne une fonction stop. Ne joue rien pour « Son du téléphone »
 * (la notification système sonne déjà) sauf si force=true (aperçu).
 */
export async function playRingtoneLoop(
  stored: string,
  opts?: { force?: boolean }
): Promise<() => Promise<void>> {
  if (Platform.OS === 'web') return async () => {};
  const source = resolveRingtoneSource(stored);
  if (!source) {
    if (!opts?.force) return async () => {}; // son téléphone : déjà géré système
    return async () => {};
  }

  try {
    const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {}

    const player = createAudioPlayer(
      (typeof source === 'number' ? source : { uri: source }) as any
    );
    player.loop = true;
    player.volume = 1.0;
    player.play();

    return async () => {
      try {
        player.pause();
        (player as any).release?.() ?? (player as any).remove?.();
      } catch {}
    };
  } catch (err) {
    console.warn('[Ringtones] Lecture impossible:', err);
    return async () => {};
  }
}
