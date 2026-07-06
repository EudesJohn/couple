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

  // Récupérer son propre profile_id
  useEffect(() => {
    getCurrentProfile().then((profile) => {
      if (profile) profileIdRef.current = profile.id;
    });
  }, []);

  // S'abonner à la présence de l'autre
  useEffect(() => {
    // Récupérer l'ID de l'autre personne
    const getPartner = async () => {
      const me = await getCurrentProfile();
      if (!me) return;

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', me.id);

      const partnerId = allProfiles?.[0]?.id;
      if (!partnerId) return;

      // Charger l'état initial
      const { data } = await supabase
        .from('presence')
        .select('*')
        .eq('profile_id', partnerId)
        .single();

      if (data) setPartnerPresence(data);

      // Écouter les changements Realtime
      const channel = supabase
        .channel('presence:partner')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'presence',
            filter: `profile_id=eq.${partnerId}`,
          },
          (payload) => {
            setPartnerPresence(payload.new as Presence);
          }
        )
        .subscribe();

      return channel;
    };

    const channelPromise = getPartner();

    return () => {
      channelPromise.then((ch) => {
        if (ch) supabase.removeChannel(ch);
      });
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
      .then(() => {});

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
          .then(() => {});
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
