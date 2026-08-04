// ============================================================
// Hook — Battement de cœur de présence
// Rend le statut "en ligne" RÉEL :
//   - au premier plan : upsert presence { is_online: true,
//     last_seen_at: maintenant } toutes les ~20s
//   - en arrière-plan / fermeture : is_online: false (pour que
//     le partenaire voie "Vu en ligne il y a …")
//   - retour au premier plan : repasse en ligne immédiatement
//
// Même mapping d'IDs que setIsTyping (getMyProfileId) pour
// écrire sur la ligne presence que le partenaire surveille.
// ============================================================
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getMyProfileId } from '../lib/profile';

const HEARTBEAT_MS = 20000;

export function usePresenceHeartbeat() {
  useEffect(() => {
    const profileId = getMyProfileId();
    if (!profileId) return;

    const write = (isOnline: boolean) => {
      supabase
        .from('presence')
        .upsert({
          profile_id: profileId,
          is_online: isOnline,
          last_seen_at: new Date().toISOString(),
        })
        .then(() => {})
        .catch(() => {});
    };

    // Marquer en ligne immédiatement au démarrage
    write(true);

    // Battement de cœur tant que l'app est visible
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') write(true);
    }, HEARTBEAT_MS);

    // Arrière-plan / premier plan
    const onVisibility = () => {
      write(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Fermeture / navigation hors de la page
    const onPageHide = () => write(false);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      write(false);
    };
  }, []);
}
