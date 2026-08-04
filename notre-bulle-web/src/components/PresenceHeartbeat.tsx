// ============================================================
// PresenceHeartbeat — monté au niveau racine de l'app pour que
// le statut "en ligne" soit réel sur TOUS les écrans (/chat,
// /cycle, /settings, verrou) et pas seulement quand le chat est
// affiché. Ne rend rien.
// ============================================================
import { usePresenceHeartbeat } from '../hooks/usePresenceHeartbeat';

export function PresenceHeartbeat() {
  usePresenceHeartbeat();
  return null;
}
