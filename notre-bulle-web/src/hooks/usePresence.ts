// ============================================================
// Hook — Présence en temps réel (Supabase Realtime)
// IDs fixes depuis la config (pas d'auth Supabase nécessaire)
//
// NOMS DE CHANNEL UNIQUES : chaque mount StrictMode reçoit un
// nom différent pour contourner la réutilisation de channel par
// RealtimeClient.channel() (qui ne retire pas les channels de
// this.channels[] après removeChannel/teardown)
// ============================================================
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Presence } from '../types/database';
import { getMyProfileId, getPartnerProfileId } from '../lib/profile';

interface UsePresenceReturn {
  partnerPresence: Presence | null;
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  isPartnerOnline: boolean;
}

let presenceMountId = 0;

export function usePresence(): UsePresenceReturn {
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [isTyping, setIsTypingState] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileIdRef = useRef<string | null>(null);

  const MY_PROFILE_ID = getMyProfileId();
  const PARTNER_PROFILE_ID = getPartnerProfileId();

  // Initialiser le ref d'ID profil
  useEffect(() => {
    profileIdRef.current = MY_PROFILE_ID;
  }, [MY_PROFILE_ID]);

  // ============================================================
  // Effet 1 — Charger l'état initial (async, avec cancelled flag)
  // ============================================================
  useEffect(() => {
    const partnerId = PARTNER_PROFILE_ID;
    if (!partnerId) return;

    let cancelled = false;

    supabase
      .from('presence')
      .select('*')
      .eq('profile_id', partnerId)
      .maybeSingle()
      .then(({ data }: { data: Presence | null }) => {
        if (!cancelled && data) {
          setPartnerPresence(data);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [PARTNER_PROFILE_ID]);

  // ============================================================
  // Effet 2 — Souscription Realtime avec nom UNIQUE
  // Chaque appel reçoit un nom différent (ex: presence:partner:1,
  // presence:partner:2) pour que RealtimeClient.channel() crée
  // toujours un nouveau channel au lieu de réutiliser l'ancien
  // + ref pour cleanup au démontage réel du composant
  // ============================================================
  useEffect(() => {
    const partnerId = PARTNER_PROFILE_ID;
    if (!partnerId) return;

    const myId = ++presenceMountId;
    const ch = supabase
      .channel(`presence:partner:${myId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'presence',
          filter: `profile_id=eq.${partnerId}`,
        },
        (payload: any) => {
          setPartnerPresence(payload.new as Presence);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [PARTNER_PROFILE_ID]);

  // ============================================================
  // Mettre à jour le statut "typing" dans Supabase
  // ============================================================
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
