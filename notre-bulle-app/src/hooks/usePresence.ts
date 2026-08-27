// ============================================================
// Hook — Présence en ligne (temps réel)
// Suit l'état online/offline + frappe du partenaire
// Charge le partenaire via getActualPartnerProfileId (même mapping
// que le reste de l'app, pas juste .neq('id', me.id))
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Presence } from '../types/database';
import { getCurrentProfile } from '../lib/supabase';

interface UsePresenceReturn {
  partnerPresence: Presence | null;
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  isPartnerOnline: boolean;
}

export function usePresence(): UsePresenceReturn {
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [isTyping, setIsTypingState] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileIdRef = useRef<string | null>(null);

  // Récupérer son propre profile_id et s'enregistrer en ligne
  useEffect(() => {
    getCurrentProfile().then((profile) => {
      if (profile) {
        profileIdRef.current = profile.id;
        // S'enregistrer en ligne au démarrage
        supabase
          .from('presence')
          .upsert({
            profile_id: profile.id,
            is_online: true,
            is_typing: false,
            last_seen_at: new Date().toISOString(),
          })
          .then(() => {}, () => {});
      }
    }).catch(() => {});
  }, []);

  // S'abonner à la présence de l'autre
  useEffect(() => {
    const getPartner = async () => {
      const me = await getCurrentProfile();
      if (!me) return;

      // Utiliser getActualPartnerProfileId pour trouver le vrai partenaire
      const { getActualPartnerProfileId } = await import('../lib/profile');
      const partnerId = await getActualPartnerProfileId();
      if (!partnerId) {
        console.warn('[Presence] Pas de partenaire trouvé');
        return;
      }

      console.log('[Presence] Partenaire:', partnerId);

      // S'assurer que le partenaire a une row presence
      await supabase
        .from('presence')
        .upsert({
          profile_id: partnerId,
          is_online: false,
          is_typing: false,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'profile_id' })
        .then(() => {}, () => {});

      // Charger l'état initial
      const { data, error } = await supabase
        .from('presence')
        .select('*')
        .eq('profile_id', partnerId)
        .maybeSingle();

      if (data) {
        console.log('[Presence] État initial:', data.is_online, data.last_seen_at);
        setPartnerPresence(data);
      } else {
        console.log('[Presence] Pas de row, état par défaut (hors ligne)');
        setPartnerPresence({ profile_id: partnerId, is_online: false, is_typing: false, last_seen_at: new Date().toISOString() });
      }

      // Écouter les changements Realtime
      const channel = supabase
        .channel(`presence:partner:${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'presence',
            filter: `profile_id=eq.${partnerId}`,
          },
          (payload) => {
            console.log('[Presence] Changement Realtime:', payload.eventType, payload.new);
            setPartnerPresence(payload.new as Presence);
          }
        )
        .subscribe((status) => {
          console.log('[Presence] Subscription:', status);
        });

      return channel;
    };

    let channelRef: any = null;
    let cancelled = false;

    getPartner().then((ch) => {
      if (!cancelled) channelRef = ch;
    });

    return () => {
      cancelled = true;
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, []);

  // Mettre à jour le statut "typing" dans Supabase
  const setIsTyping = useCallback((typing: boolean) => {
    setIsTypingState(typing);
    const profileId = profileIdRef.current;
    if (!profileId) return;

    supabase
      .from('presence')
      .upsert({
        profile_id: profileId,
        is_typing: typing,
        is_online: true,
        last_seen_at: new Date().toISOString(),
      })
      .then(() => {}, () => {});

    // Auto-reset après 3s sans frappe
    if (typing) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setIsTypingState(false);
        supabase
          .from('presence')
          .upsert({
            profile_id: profileId,
            is_typing: false,
            is_online: true,
            last_seen_at: new Date().toISOString(),
          })
          .then(() => {}, () => {});
      }, 3000);
    }
  }, []);

  return {
    partnerPresence,
    isTyping,
    setIsTyping,
    isPartnerOnline: partnerPresence?.is_online ?? false,
  };
}
