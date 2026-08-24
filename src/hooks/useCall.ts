// ============================================================
// Hook — Appels audio/vidéo entre 2 personnes
// Signaling : Supabase Realtime + ZegoCloud media
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentProfile } from '../lib/supabase';
import { joinRoom, leaveRoom, startPublish, stopPublish, toggleSpeaker, muteMicrophone, startPlayingStream, stopPlayingStream, setOnRemoteStreamUpdate, setOnConnectionStateChange, createOffer, switchCamera as switchCameraZego } from '../lib/zego';
import type { Call, CallType } from '../types/database';
import { router } from 'expo-router';
import { notifyIncomingCall, clearBadge } from './useNotifications';

type CallStateType = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

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
  switchCamera: () => Promise<boolean>;
  resetCall: () => void;
}

export function useCall(): UseCallReturn {
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
  // Flag : l'appel a déjà été connecté (pour wasAnswered dans endCall)
  const wasEverConnectedRef = useRef(false);
  // Timer de grâce pour 'disconnected' — WebRTC peut se reconnecter
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les profils
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

  // Timer
  const startCallTimer = useCallback(() => {
    setCallDuration(0);
    callTimerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCallTimer(), [stopCallTimer]);

  // ─── Realtime : écouter les appels entrants ───
  useEffect(() => {
    const channel = supabase
      .channel('calls:live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        async (payload) => {
          const call = payload.new as Call;
          const me = await getCurrentProfile();
          if (!me || call.caller_id === me.id) return; // c'est nous qui appelons

          // Appel entrant — notification + état
          setIncomingCall(call);
          setCallType(call.type);
          setCallState('ringing');
          notifyIncomingCall(partnerRef.current?.name || 'Partenaire', call.type);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls' },
        async (payload) => {
          const updated = payload.new as Call;
          const me = await getCurrentProfile();
          if (!me) return;

          // L'autre a répondu
          if (
            updated.status === 'answered' &&
            updated.caller_id === me.id &&
            currentCallIdRef.current === updated.id
          ) {
            setCallState('connecting');
            // L'appelant a reçu la réponse → non-offerer, attend l'offre du callee
            await initZegoCall(updated.id, updated.type, false);
          }

          // L'autre a rejeté / annulé
          if (
            (updated.status === 'cancelled' || updated.status === 'failed') &&
            currentCallIdRef.current === updated.id
          ) {
            setCallState('ended');
            setTimeout(() => setCallState('idle'), 2000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── Initialiser WebRTC (caller = false, callee = offerer = true) ───
  const initZegoCall = useCallback(async (callId: string, type: CallType, isOfferer: boolean) => {
    const me = profileRef.current;
    if (!me) return;

    // Toujours installer les callbacks, quelle que soit la branche.
    setOnConnectionStateChange((state) => {
      // 'disconnected' est temporaire — WebRTC peut se reconnecter
      // (réseau mobile instable, transition WiFi/4G). On donne 5s de
      // grâce avant de considérer l'appel comme terminé.
      // 'failed' = irrécupérable → on coupe immédiatement.
      if (state === 'failed') {
        if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
        setCallState('ended');
        setTimeout(() => setCallState((s) => s === 'ended' ? 'idle' : s), 2000);
      } else if (state === 'disconnected') {
        if (disconnectTimerRef.current) return;
        disconnectTimerRef.current = setTimeout(() => {
          disconnectTimerRef.current = null;
          setCallState((prev) => prev === 'connected' ? 'ended' : prev);
          setTimeout(() => setCallState((s) => s === 'ended' ? 'idle' : s), 2000);
        }, 5000);
      } else if (state === 'connected') {
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
      }
    });

    // Jouer le flux distant quand il apparaît
    setOnRemoteStreamUpdate((streams, added) => {
      if (added && streams.length > 0) {
        const sid = streams[0].streamID;
        remoteStreamIdRef.current = sid;
        startPlayingStream(sid).catch((err) =>
          console.error('Erreur lecture flux distant:', err)
        );
      }
    });

    try {
      await joinRoom(callId, { userID: me.id, userName: me.name });
      await startPublish(type === 'video');

      // Seul l'appelé (offerer) crée l'offre SDP. L'appelant attend
      // l'offre → handleOffer → answer.
      if (isOfferer) {
        // Petit délai pour laisser l'autre rejoindre le canal de signalisation
        await new Promise((r) => setTimeout(r, 600));
        await createOffer();
      }

      setCallState('connected');
      wasEverConnectedRef.current = true;
      startCallTimer();
    } catch (err) {
      console.error('Erreur WebRTC:', err);
      setCallState('ended');
      setTimeout(() => setCallState((s) => s === 'ended' ? 'idle' : s), 2000);
    }
  }, [startCallTimer]);

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
        status: 'missed',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !call) {
      setCallState('idle');
      return;
    }

    currentCallIdRef.current = call.id;
    router.push(`/call?callId=${call.id}&type=${type}&role=caller`);
  }, []);

  // ─── RÉPONDRE ───
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    const callId = incomingCall.id;
    currentCallIdRef.current = callId;
    setCallState('connecting');
    setIncomingCall(null);

    await supabase
      .from('calls')
      .update({ status: 'answered', answered_at: new Date().toISOString() })
      .eq('id', callId);

    router.push(`/call?callId=${callId}&type=${incomingCall.type}&role=callee`);
    // Le callee est offerer → crée l'offre SDP
    await initZegoCall(callId, incomingCall.type, true);
  }, [incomingCall, initZegoCall]);

  // ─── REJETER ───
  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;
    await supabase.from('calls').update({ status: 'failed' }).eq('id', incomingCall.id);
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall]);

  // ─── RACCROCHER ───
  const endCall = useCallback(async () => {
    const callId = currentCallIdRef.current;
    if (!callId) return;
    setCallState('ended');

    // Arrêter le flux distant
    const remoteId = remoteStreamIdRef.current;
    if (remoteId) {
      await stopPlayingStream(remoteId).catch(() => {});
      remoteStreamIdRef.current = null;
    }

    setOnRemoteStreamUpdate(null);
    setOnConnectionStateChange(null);
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
    await stopPublish();
    await leaveRoom(callId);

    const wasAnswered = wasEverConnectedRef.current;
    await supabase
      .from('calls')
      .update({
        status: wasAnswered ? 'answered' : 'cancelled',
        ended_at: new Date().toISOString(),
        duration_s: wasAnswered ? callDuration : null,
      })
      .eq('id', callId);

    stopCallTimer();
    currentCallIdRef.current = null;
    wasEverConnectedRef.current = false;

    setTimeout(() => {
      setCallState('idle');
      if (router.canGoBack()) router.back();
    }, 1000);
  }, [callDuration, stopCallTimer]);

  // ─── Contrôles ───
  const toggleMute = useCallback(async () => {
    const v = !isMuted;
    setIsMuted(v);
    await muteMicrophone(v);
  }, [isMuted]);

  const toggleSpeakerFn = useCallback(async () => {
    const v = !isSpeakerOn;
    setIsSpeakerOn(v);
    await toggleSpeaker(v);
  }, [isSpeakerOn]);

  const switchCamera = useCallback(async (): Promise<boolean> => {
    try {
      return await switchCameraZego();
    } catch {
      return false;
    }
  }, []);

  const resetCall = useCallback(() => {
    setCallState('idle');
    setIncomingCall(null);
    setCallDuration(0);
    currentCallIdRef.current = null;
    wasEverConnectedRef.current = false;
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
    stopCallTimer();
  }, [stopCallTimer]);

  return {
    callState, callType, callDuration, isSpeakerOn, isMuted, incomingCall,
    startCall, answerCall, rejectCall, endCall, toggleMute, toggleSpeakerFn,
    switchCamera, resetCall,
  };
}
