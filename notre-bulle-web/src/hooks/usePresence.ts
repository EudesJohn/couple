// ============================================================
// Hook — Présence en temps réel (Supabase Realtime)
// IDs fixes depuis la config (pas d'auth Supabase nécessaire)
//
// NOMS DE CHANNEL UNIQUES : chaque mount StrictMode reçoit un
// nom différent pour contourner la réutilisation de channel par
// RealtimeClient.channel() (qui ne retire pas les channels de
// this.channels[] après removeChannel/teardown)
// ============================================================
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Presence } from '../types/database';
import { getMyProfileId, getPartnerProfileId } from '../lib/profile';

interface UsePresenceReturn {
  partnerPresence: Presence | null;
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  isPartnerOnline: boolean;
  /** Label tout prêt : "En ligne", "En ligne il y a X…" ou "Hors ligne" */
  lastSeenLabel: string;
}

// Un partenaire est considéré EN LIGNE seulement si son battement
// de cœur (last_seen_at) est récent (< 45s). Sinon on le traite
// comme hors ligne même si is_online est resté à true (app tuée
// sans pagehide → statut "collé" en ligne).
const ONLINE_FRESH_MS = 45000;

// Cadence de rafraîchissement du tick qui fait avancer le compteur
// du label "Vu en ligne il y a X min".
const TICK_MS = 5000;

// Formate un timestamp en relatif : "à l'instant", "il y a X min",
// "il y a X h", "hier", "il y a X j", "le 5 août".
function formatLastSeen(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'Hors ligne';
  const diffSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (diffSec < 45) return "à l'instant";
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return m <= 1 ? 'il y a 1 min' : `il y a ${m} min`;
  }
  const h = Math.floor(diffSec / 3600);
  if (h < 24) return h === 1 ? 'il y a 1 h' : `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} j`;
  return `le ${new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

let presenceMountId = 0;

export function usePresence(): UsePresenceReturn {
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [isTyping, setIsTypingState] = useState(false);
  // Tick "maintenant" : fait avancer la fraîcheur du last_seen et le
  // compteur du label "Vu en ligne il y a X min".
  const [now, setNow] = useState(() => Date.now());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileIdRef = useRef<string | null>(null);

  const MY_PROFILE_ID = getMyProfileId();
  const PARTNER_PROFILE_ID = getPartnerProfileId();

  // Initialiser le ref d'ID profil
  useEffect(() => {
    profileIdRef.current = MY_PROFILE_ID;
  }, [MY_PROFILE_ID]);

  // Tick périodique pour re-évaluer en ligne/hors ligne et le label
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

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

  // En ligne SEULEMENT si is_online est vrai ET le dernier battement
  // de cœur est frais (< 45s). Sinon : hors ligne / "vu en ligne …".
  const lastSeenMs = partnerPresence?.last_seen_at
    ? new Date(partnerPresence.last_seen_at).getTime()
    : 0;
  const isPartnerOnline =
    partnerPresence?.is_online === true && now - lastSeenMs < ONLINE_FRESH_MS;

  // Label prêt à afficher : "En ligne" / "En ligne il y a X…" / "Hors ligne"
  const lastSeenLabel = useMemo(() => {
    if (isPartnerOnline) return 'En ligne';
    if (!partnerPresence?.last_seen_at) return 'Hors ligne';
    return 'En ligne ' + formatLastSeen(partnerPresence.last_seen_at, now);
  }, [isPartnerOnline, partnerPresence?.last_seen_at, now]);

  return {
    partnerPresence,
    isTyping,
    setIsTyping,
    isPartnerOnline,
    lastSeenLabel,
  };
}
