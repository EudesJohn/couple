// ============================================================
// Hook — Appels audio/vidéo entre 2 personnes
// Signaling : Supabase Realtime + WebRTC
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentProfile } from '../lib/supabase';
import { joinRoom, leaveRoom, startPublish, stopPublish, toggleSpeaker, muteMicrophone, startPlayingStream, stopPlayingStream, setOnRemoteStreamUpdate } from '../lib/zego';
import type { Call, CallType } from '../types/database';
import { notifyIncomingCall } from './useNotifications';

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
        async (payload: any) => {
          const call = payload.new as Call;
          const me = await getCurrentProfile();
          if (!me || call.caller_id === me.id) return;

          setIncomingCall(call);
          setCallType(call.type);
          setCallState('ringing');
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

          if (updated.status === 'answered' && updated.caller_id === me.id && currentCallIdRef.current === updated.id) {
            setCallState('connecting');
            await initZegoCall(updated.id, updated.type);
          }

          if ((updated.status === 'cancelled' || updated.status === 'failed') && currentCallIdRef.current === updated.id) {
            setCallState('ended');
            setTimeout(() => setCallState('idle'), 2000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const initZegoCall = useCallback(async (callId: string, type: CallType) => {
    const me = profileRef.current;
    if (!me) return;

    try {
      await joinRoom(callId, { userID: me.id, userName: me.name });

      setOnRemoteStreamUpdate((streams, added) => {
        if (added && streams.length > 0) {
          const sid = streams[0].streamID;
          remoteStreamIdRef.current = sid;
          startPlayingStream(sid).catch((err) =>
            console.error('Erreur lecture flux distant:', err)
          );
        }
      });

      await startPublish();
      setCallState('connected');
      startCallTimer();
    } catch (err) {
      console.error('Erreur WebRTC:', err);
      setCallState('ended');
      setTimeout(() => setCallState('idle'), 2000);
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
    navigate(`/call?callId=${call.id}&type=${type}&role=caller`);
  }, [navigate]);

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

    navigate(`/call?callId=${callId}&type=${incomingCall.type}&role=callee`);
    await initZegoCall(callId, incomingCall.type);
  }, [incomingCall, initZegoCall, navigate]);

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

    const remoteId = remoteStreamIdRef.current;
    if (remoteId) {
      await stopPlayingStream(remoteId).catch(() => {});
      remoteStreamIdRef.current = null;
    }

    setOnRemoteStreamUpdate(null);
    await stopPublish();
    await leaveRoom(callId);

    await supabase
      .from('calls')
      .update({ status: 'answered', ended_at: new Date().toISOString(), duration_s: callDuration })
      .eq('id', callId);

    stopCallTimer();
    currentCallIdRef.current = null;

    setTimeout(() => {
      setCallState('idle');
      navigate(-1);
    }, 1000);
  }, [callDuration, stopCallTimer, navigate]);

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

  const resetCall = useCallback(() => {
    setCallState('idle');
    setIncomingCall(null);
    setCallDuration(0);
    currentCallIdRef.current = null;
    stopCallTimer();
  }, [stopCallTimer]);

  return {
    callState, callType, callDuration, isSpeakerOn, isMuted, incomingCall,
    startCall, answerCall, rejectCall, endCall, toggleMute, toggleSpeakerFn, resetCall,
  };
}
