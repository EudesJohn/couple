// ============================================================
// Hook — Appels audio/vidéo entre 2 personnes
// Signaling : Supabase Realtime + WebRTC
//
// Deux instances du hook coexistent :
// - ChatLayout : détecte les appels entrants (INSERT Realtime)
// - CallScreen : initie WebRTC depuis l'URL (callId, role, type)
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentProfile } from '../lib/supabase';
import {
  joinRoom, leaveRoom, startPublish, stopPublish,
  toggleSpeaker, muteMicrophone,
  startPlayingStream, stopPlayingStream, setOnRemoteStreamUpdate,
  setOnConnectionStateChange,
  createOffer,
} from '../lib/zego';
import type { Call, CallType } from '../types/database';
import { notifyIncomingCall, notifyMissedCall } from './useNotifications';
import { startRingtone, stopRingtone, playCallEndSound } from '../lib/sounds';

// Compteur pour noms de channel uniques (contourne le bug RealtimeClient.channel()
// qui ne libère pas les channels après removeChannel)
let callChannelMountId = 0;

type CallStateType = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

// Garde-fou module-level : les deux instances (ChatLayout / CallScreen) reçoivent les
// mêmes événements Realtime. On garde un traceur pour la connexion WebRTC mais on ne
// bloque pas : les opérations dans zego.ts sont idempotentes (joinRoom, startPublish,
// createOffer avec flag offerSent), donc les deux instances peuvent appeler initZegoCall
// sans risque de double initialisation.
let _zegoInitializedCallId: string | null = null;

// Événement module-level pour synchroniser l'état 'connected' entre toutes les instances
// de useCall (ChatLayout + CallScreen). Une seule instance initie WebRTC (via le garde-fou
// ci-dessus), mais toutes doivent passer à callState = 'connected'.
let _connectedListeners: Array<() => void> = [];

function onCallConnected(cb: () => void): () => void {
  _connectedListeners.push(cb);
  return () => {
    _connectedListeners = _connectedListeners.filter(l => l !== cb);
  };
}

function emitCallConnected(): void {
  _connectedListeners.forEach(cb => cb());
}

interface UseCallReturn {
  callState: CallStateType;
  callType: CallType;
  callDuration: number;
  isSpeakerOn: boolean;
  isMuted: boolean;
  incomingCall: Call | null;
  startCall: (type: CallType) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleSpeakerFn: () => Promise<void>;
  resetCall: () => void;
}

export function useCall(): UseCallReturn {
  const navigate = useNavigate();
  const [callState, setCallState] = useState<CallStateType>('idle');
  const [callType, setCallType] = useState<CallType>('audio');
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);

  const profileRef = useRef<{ id: string; name: string } | null>(null);
  const partnerRef = useRef<{ id: string; name: string } | null>(null);
  const currentCallIdRef = useRef<string | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteStreamIdRef = useRef<string | null>(null);
  const callStateRef = useRef<CallStateType>(callState);
  callStateRef.current = callState;

  // ─── Charger les profils ───
  useEffect(() => {
    const loadProfiles = async () => {
      const me = await getCurrentProfile();
      if (!me) return;
      profileRef.current = { id: me.id, name: me.display_name };

      const { data: partners } = await supabase
        .from('profiles')
        .select('id, display_name')
        .neq('id', me.id)
        .limit(1);

      if (partners?.[0]) {
        partnerRef.current = { id: partners[0].id, name: partners[0].display_name };
      }
    };
    loadProfiles();
  }, []);

  // ─── Timer ───
  const startCallTimer = useCallback(() => {
    setCallDuration(0);
    if (callTimerRef.current) return; // déjà un timer en cours (évite le double appel)
    callTimerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCallTimer(), [stopCallTimer]);

  // ─── Init WebRTC (partagé entre caller et callee) ───
  const initZegoCall = useCallback(async (callId: string, type: CallType, isOfferer: boolean) => {
    // Le profil peut ne pas être chargé quand le URL-init de CallScreen s'exécute
    // (l'effet de chargement du profil est async). On le charge ici si besoin.
    if (!profileRef.current) {
      const p = await getCurrentProfile();
      if (!p) return;
      profileRef.current = { id: p.id, name: p.display_name };
      // Chargement partenaire non-bloquant (utilisé pour les notifications seulement)
      if (partnerRef.current === null) {
        supabase.from('profiles').select('id, display_name').neq('id', p.id).limit(1).then(({ data }: { data: { id: string; display_name: string }[] | null }) => {
          if (data?.[0]) partnerRef.current = { id: data[0].id, name: data[0].display_name };
        }).catch(() => {});
      }
    }

    const me = profileRef.current;
    if (!me) return;

    const alreadyInit = _zegoInitializedCallId === callId;

    // Toujours installer les callbacks, quelle que soit la branche,
    // pour que la 2e instance (p. ex. CallScreen après ChatLayout) ait
    // ses propres handlers de connexion et de flux distant.
    setOnConnectionStateChange((state) => {
      if (state === 'disconnected' || state === 'failed') {
        setCallState('ended');
        setTimeout(() => setCallState('idle'), 2000);
      }
    });

    setOnRemoteStreamUpdate((streams, added) => {
      if (added && streams.length > 0) {
        const sid = streams[0].streamID;
        remoteStreamIdRef.current = sid;
        startPlayingStream(sid).catch((err) =>
          console.error('Erreur lecture flux distant:', err)
        );
      }
    });

    if (!alreadyInit) {
      // Première instance à initialiser WebRTC pour ce call
      _zegoInitializedCallId = callId;

      try {
        await joinRoom(callId, { userID: me.id, userName: me.name });
        await startPublish(type === 'video');

        // Seul l'appelé crée l'offre SDP. L'appelant attend l'offre → handleOffer → answer.
        if (isOfferer) {
          // Petit délai pour laisser l'autre rejoindre le canal de signalisation
          await new Promise(r => setTimeout(r, 600));
          await createOffer();
        }

        setCallState('connected');
        emitCallConnected();
        startCallTimer();
      } catch (err) {
        console.error('Erreur WebRTC:', err);
        _zegoInitializedCallId = null; // permet une tentative ultérieure
        setCallState('ended');
        setTimeout(() => setCallState('idle'), 2000);
      }
    } else {
      // Déjà initialisé par une autre instance (p. ex. ChatLayout a pris le
      // verrou avant CallScreen, ou l'appelant via Realtime avant l'appelé)
      try {
        // Si on doit envoyer l'offre mais que l'autre instance ne l'a pas fait, on le fait ici
        if (isOfferer) {
          await createOffer(); // Ne fait rien si offer déjà envoyé (offerSent flag)
        }
      } catch (err) {
        console.error('Erreur WebRTC (secondaire):', err);
      }

      // Synchroniser l'état de tous les useCall
      if (callStateRef.current === 'connecting' || callStateRef.current === 'calling') {
        setCallState('connected');
        startCallTimer();
      }
    }
  }, [startCallTimer]);

  // ─── Synchronisation inter-instances : quand une instance réussit WebRTC,
  //       toutes les autres (ChatLayout / CallScreen) reçoivent l'événement ───
  useEffect(() => {
    const onConnected = () => {
      // On utilise currentCallIdRef plutôt que callStateRef pour éviter le
      // problème de stale ref (au moment où emitCallConnected est appelé,
      // le re-render avec 'connecting' n'a pas encore eu lieu).
      if (currentCallIdRef.current && callStateRef.current !== 'connected' && callStateRef.current !== 'ended') {
        setCallState('connected');
        startCallTimer();
      }
    };
    return onCallConnected(onConnected);
  }, [startCallTimer]);

  // ============================================================
  // AUTO-INIT depuis l'URL — quand CallScreen se monte
  // ============================================================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callId = params.get('callId');
    const role = params.get('role');
    const type = params.get('type');
    if (!callId || !role || !type) return;

    currentCallIdRef.current = callId;
    setCallType(type as CallType);

    if (role === 'caller') {
      // L'appelant attend que le partenaire réponde — le handler Realtime UPDATE s'en charge
      setCallState('calling');
    } else {
      // Le répondant initie WebRTC immédiatement en tant qu'offerer
      setCallState('connecting');
      initZegoCall(callId, type as CallType, true);
    }

    return () => {
      // React 19 StrictMode monte/démonte/monte l'effet 2×.
      // Sans ce cleanup, le 2e montage voit _zegoInitializedCallId déjà positionné
      // et passe dans le bloc alreadyInit (qui ne fait pas la véritable init WebRTC).
      if (_zegoInitializedCallId === callId) {
        _zegoInitializedCallId = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // REALTIME — écouter les mutations sur la table calls
  // ============================================================
  useEffect(() => {
    const mid = ++callChannelMountId;
    const channel = supabase
      .channel(`calls:live:${mid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        async (payload: any) => {
          const call = payload.new as Call;
          const me = await getCurrentProfile();
          if (!me || call.caller_id === me.id) return;

          setIncomingCall(call);
          setCallType(call.type);
          setCallState('ringing');
          currentCallIdRef.current = call.id; // pour que l'UPDATE puisse nettoyer
          notifyIncomingCall(partnerRef.current?.name || 'Partenaire', call.type);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls' },
        async (payload: any) => {
          const updated = payload.new as Call;
          const me = await getCurrentProfile();
          if (!me) return;

          // L'appelant détecte que le partenaire a répondu (answerer = pas d'offre SDP)
          if (updated.status === 'answered' && !updated.ended_at && updated.caller_id === me.id && currentCallIdRef.current === updated.id) {
            setCallState('connecting');
            await initZegoCall(updated.id, updated.type, false);
          }

          // Le partenaire a raccroché (status='answered' avec ended_at)
          if (updated.status === 'answered' && updated.ended_at && currentCallIdRef.current === updated.id) {
            if (callStateRef.current !== 'ended') {
              setOnRemoteStreamUpdate(null);
              setOnConnectionStateChange(null);
              await stopPublish().catch(() => {});
              await leaveRoom(updated.id).catch(() => {});
              stopCallTimer();
              currentCallIdRef.current = null;
              _zegoInitializedCallId = null;
              setCallState('ended');
              setTimeout(() => setCallState('idle'), 2000);
            }
          }

          // Le partenaire a annulé / l'appel a échoué
          if (
            (updated.status === 'cancelled' || updated.status === 'failed') &&
            currentCallIdRef.current === updated.id
          ) {
            stopRingtone();
            // Notification si l'appel n'avait pas encore abouti (appel manqué)
            if (callStateRef.current === 'ringing' || callStateRef.current === 'idle') {
              notifyMissedCall(partnerRef.current?.name || 'Partenaire', callType);
            }
            // Nettoyer les ressources WebRTC (media, PC, signal channel)
            setOnRemoteStreamUpdate(null);
            setOnConnectionStateChange(null);
            await stopPublish().catch(() => {});
            await leaveRoom(updated.id).catch(() => {});
            stopCallTimer();
            currentCallIdRef.current = null;
            _zegoInitializedCallId = null;
            setCallState('ended');
            setTimeout(() => setCallState('idle'), 2000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initZegoCall]);

  // ─── LANCER un appel ───
  const startCall = useCallback(async (type: CallType) => {
    const me = profileRef.current;
    if (!me) return;

    setCallType(type);
    setCallState('calling');

    const { data: call, error } = await supabase
      .from('calls')
      .insert({
        caller_id: me.id,
        type,
        status: 'missed', // 'missed' = en attente de réponse dans ce schema
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !call) {
      setCallState('idle');
      return;
    }

    currentCallIdRef.current = call.id;
    navigate(`/call?callId=${call.id}&type=${type}&role=caller`);
  }, [navigate]);

  // ─── RÉPONDRE ───
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtone();
    const callId = incomingCall.id;
    currentCallIdRef.current = callId;
    setIncomingCall(null);

    await supabase
      .from('calls')
      .update({ status: 'answered', answered_at: new Date().toISOString() })
      .eq('id', callId);

    // Naviguer → CallScreen se monte → URL-init lance initZegoCall
    navigate(`/call?callId=${callId}&type=${incomingCall.type}&role=callee`);
  }, [incomingCall, navigate]);

  // ─── REJETER ───
  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtone();
    await supabase.from('calls').update({ status: 'failed' }).eq('id', incomingCall.id);
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall]);

  // ─── RACCROCHER ───
  const endCall = useCallback(async () => {
    const callId = currentCallIdRef.current;
    if (!callId) return;
    stopRingtone();
    playCallEndSound();
    setCallState('ended');

    const remoteId = remoteStreamIdRef.current;
    if (remoteId) {
      await stopPlayingStream(remoteId).catch(() => {});
      remoteStreamIdRef.current = null;
    }

    setOnRemoteStreamUpdate(null);
    setOnConnectionStateChange(null);
    await stopPublish();
    await leaveRoom(callId);

    // Si l'appel était connecté → 'answered', sinon → 'cancelled'
    const wasAnswered = callState === 'connected';
    await supabase
      .from('calls')
      .update({
        status: wasAnswered ? 'answered' : 'cancelled',
        ended_at: new Date().toISOString(),
        duration_s: wasAnswered ? callDuration : null,
      })
      .eq('id', callId);

    // ─── Journal d'appel : insérer un message type 'call' ───
    const me = profileRef.current;
    if (me) {
      const { data: callRecord } = await supabase
        .from('calls')
        .select('caller_id, type')
        .eq('id', callId)
        .single();

      if (callRecord) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .limit(1)
          .single();

        if (conv) {
          // sender_id = caller_id pour que isOwn fonctionne des deux côtés
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            sender_id: callRecord.caller_id,
            type: 'call',
            content: JSON.stringify({
              callType: callRecord.type,
              duration: wasAnswered ? callDuration : 0,
              status: wasAnswered ? 'answered' : 'cancelled',
            }),
          });
        }
      }
    }

    stopCallTimer();
    currentCallIdRef.current = null;
    _zegoInitializedCallId = null;

    setTimeout(() => {
      setCallState('idle');
      navigate(-1);
    }, 1000);
  }, [callDuration, callState, stopCallTimer, navigate]);

  // ─── Toggle Muet ───
  const toggleMute = useCallback(async () => {
    const v = !isMuted;
    setIsMuted(v);
    await muteMicrophone(v);
  }, [isMuted]);

  // ─── Toggle Haut-parleur ───
  const toggleSpeakerFn = useCallback(async () => {
    const v = !isSpeakerOn;
    setIsSpeakerOn(v);
    await toggleSpeaker(v);
  }, [isSpeakerOn]);

  const resetCall = useCallback(() => {
    setCallState('idle');
    setIncomingCall(null);
    setCallDuration(0);
    currentCallIdRef.current = null;
    _zegoInitializedCallId = null;
    stopCallTimer();
  }, [stopCallTimer]);

  return {
    callState, callType, callDuration, isSpeakerOn, isMuted, incomingCall,
    startCall, answerCall, rejectCall, endCall, toggleMute, toggleSpeakerFn, resetCall,
  };
}
