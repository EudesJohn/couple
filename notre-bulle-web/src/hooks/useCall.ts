// ============================================================
// Hook — Appels audio/vidéo entre 2 personnes
// Signaling : Supabase Realtime + WebRTC
//
// L'état des appels est partagé entre toutes les instances du hook
// (ChatLayout, CallScreen, CallOverlay) via un store module-level.
// Ainsi, le démontage/remontage de CallScreen (minimisation) ne
// perd pas l'état de l'appel.
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
  createOffer, switchCamera as switchCameraZego,
} from '../lib/zego';
import type { Call, CallType } from '../types/database';
import { notifyIncomingCall, notifyMissedCall } from './useNotifications';
import { startRingtone, stopRingtone, playCallEndSound } from '../lib/sounds';

// Compteur pour noms de channel uniques (contourne le bug RealtimeClient.channel()
// qui ne libère pas les channels après removeChannel)
let callChannelMountId = 0;

type CallStateType = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

// =============================================================
// STORE MODULE-LEVEL — partagé entre toutes les instances
// =============================================================
type CallStore = {
  callState: CallStateType;
  callType: CallType;
  callDuration: number;
  isSpeakerOn: boolean;
  isMuted: boolean;
  incomingCall: Call | null;
};

const _store: CallStore = {
  callState: 'idle',
  callType: 'audio',
  callDuration: 0,
  isSpeakerOn: false,
  isMuted: false,
  incomingCall: null,
};
const _storeListeners = new Set<() => void>();

function _updateStore(updates: Partial<CallStore>): void {
  Object.assign(_store, updates);
  _storeListeners.forEach(fn => fn());
}

function _useStore(): CallStore {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    _storeListeners.add(listener);
    return () => { _storeListeners.delete(listener); };
  }, []);
  return _store;
}

// =============================================================
// TIMER MODULE-LEVEL — un seul timer pour toutes les instances
// =============================================================
let _callTimer: ReturnType<typeof setInterval> | null = null;

function _startSharedTimer(): void {
  if (_callTimer) return; // déjà en cours
  _updateStore({ callDuration: 0 });
  _callTimer = setInterval(() => {
    _updateStore({ callDuration: _store.callDuration + 1 });
  }, 1000);
}

function _stopSharedTimer(): void {
  if (_callTimer) {
    clearInterval(_callTimer);
    _callTimer = null;
  }
}

// Garde-fou module-level : les deux instances (ChatLayout / CallScreen) reçoivent les
// mêmes événements Realtime. On garde un traceur pour la connexion WebRTC mais on ne
// bloque pas : les opérations dans zego.ts sont idempotentes (joinRoom, startPublish,
// createOffer avec flag offerSent), donc les deux instances peuvent appeler initZegoCall
// sans risque de double initialisation.
let _zegoInitializedCallId: string | null = null;

// Flag : l'appel a déjà été connecté (pour wasAnswered dans endCall,
// même si WebRTC s'est déconnecté entre-temps)
let _wasEverConnected = false;

// Timer de grâce pour 'disconnected' — WebRTC peut se reconnecter
// après une coupure réseau temporaire (contrairement à 'failed')
let _disconnectTimer: ReturnType<typeof setTimeout> | null = null;

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

// =============================================================
// WAKE LOCK — maintient l'écran éveillé pendant l'appel
// =============================================================
let _wakeLock: any = null;

async function _requestWakeLock(): Promise<void> {
  if ('wakeLock' in navigator && _store.callState === 'connected') {
    try {
      _wakeLock = await (navigator as any).wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    } catch {
      _wakeLock = null;
    }
  }
}

function _releaseWakeLock(): void {
  if (_wakeLock) {
    _wakeLock.release().catch(() => {});
    _wakeLock = null;
  }
}

// =============================================================
// BACKGROUND KEEPALIVE — empêche la suspension du navigateur
// quand l'appel est actif et que l'utilisateur quitte l'app
// (PWA / changement d'onglet / mise en arrière-plan)
// =============================================================

// AudioContext silencieux : technique standard pour signaler au
// navigateur que la page utilise l'audio, ce qui réduit les
// chances de suspension en arrière-plan (Chrome suspend moins
// les pages qui produisent du son, même quasi-silencieux).
let _bgAudioCtx: AudioContext | null = null;

function _startBackgroundKeepalive(): void {
  if (_bgAudioCtx) return;
  try {
    _bgAudioCtx = new AudioContext();
    const osc = _bgAudioCtx.createOscillator();
    const gain = _bgAudioCtx.createGain();
    gain.gain.value = 0.001; // quasi-silencieux
    osc.connect(gain).connect(_bgAudioCtx.destination);
    osc.start();
  } catch {
    _bgAudioCtx = null;
  }
}

function _stopBackgroundKeepalive(): void {
  if (_bgAudioCtx) {
    _bgAudioCtx.close().catch(() => {});
    _bgAudioCtx = null;
  }
}

// Gestionnaire beforeunload : prévient l'utilisateur avant de
// fermer l'onglet/app PWA pendant un appel actif
function _handleBeforeUnload(e: BeforeUnloadEvent): void {
  if (_store.callState === 'connected') {
    e.preventDefault();
    e.returnValue = ''; // Chrome nécessite un returnValue non vide
  }
}

function _setupBeforeUnload(): void {
  window.addEventListener('beforeunload', _handleBeforeUnload);
}

function _teardownBeforeUnload(): void {
  window.removeEventListener('beforeunload', _handleBeforeUnload);
}

// =============================================================
// HOOK PRINCIPAL
// =============================================================
export interface UseCallReturn {
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
  const navigate = useNavigate();
  const shared = _useStore();
  const callState = shared.callState;
  const callType = shared.callType;
  const callDuration = shared.callDuration;
  const isSpeakerOn = shared.isSpeakerOn;
  const isMuted = shared.isMuted;
  const incomingCall = shared.incomingCall;

  const profileRef = useRef<{ id: string; name: string } | null>(null);
  const partnerRef = useRef<{ id: string; name: string } | null>(null);
  const currentCallIdRef = useRef<string | null>(null);
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

  // ─── Wake Lock + Background Keepalive : garder l'écran et
  //       l'appel actifs même en arrière-plan PWA ───
  useEffect(() => {
    if (callState === 'connected') {
      _requestWakeLock();
      _startBackgroundKeepalive();
      _setupBeforeUnload();
    } else {
      _releaseWakeLock();
      _stopBackgroundKeepalive();
      _teardownBeforeUnload();
    }
  }, [callState]);

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
      // 'disconnected' est temporaire — WebRTC peut se reconnecter
      // (réseau mobile instable, transition WiFi/4G, etc.)
      // On donne 5s de grâce avant de considérer l'appel comme terminé.
      // 'failed' = irrécupérable → on coupe immédiatement.
      if (state === 'failed') {
        if (_disconnectTimer) { clearTimeout(_disconnectTimer); _disconnectTimer = null; }
        _updateStore({ callState: 'ended' });
        setTimeout(() => _updateStore({ callState: 'idle' }), 2000);
      } else if (state === 'disconnected') {
        if (_disconnectTimer) return; // déjà un timer en cours
        _disconnectTimer = setTimeout(() => {
          _disconnectTimer = null;
          // Après 5s sans reconnexion, on termine l'appel
          _updateStore({ callState: 'ended' });
          setTimeout(() => _updateStore({ callState: 'idle' }), 2000);
        }, 5000);
      } else if (state === 'connected') {
        // Reconnexion réussie → annuler le timer de grâce
        if (_disconnectTimer) {
          clearTimeout(_disconnectTimer);
          _disconnectTimer = null;
        }
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

        _updateStore({ callState: 'connected' });
        _wasEverConnected = true;
        emitCallConnected();
        _startSharedTimer();
      } catch (err) {
        console.error('Erreur WebRTC:', err);
        _zegoInitializedCallId = null; // permet une tentative ultérieure
        _updateStore({ callState: 'ended' });
        setTimeout(() => _updateStore({ callState: 'idle' }), 2000);
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
        _updateStore({ callState: 'connected' });
        _startSharedTimer();
      }
    }
  }, []);

  // ─── Synchronisation inter-instances : quand une instance réussit WebRTC,
  //       toutes les autres (ChatLayout / CallScreen) reçoivent l'événement ───
  useEffect(() => {
    const onConnected = () => {
      // On utilise currentCallIdRef plutôt que callStateRef pour éviter le
      // problème de stale ref (au moment où emitCallConnected est appelé,
      // le re-render avec 'connecting' n'a pas encore eu lieu).
      if (currentCallIdRef.current && callStateRef.current !== 'connected' && callStateRef.current !== 'ended') {
        _updateStore({ callState: 'connected' });
        _startSharedTimer();
      }
    };
    return onCallConnected(onConnected);
  }, []);

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
    _updateStore({ callType: type as CallType });

    if (role === 'caller') {
      // L'appelant attend que le partenaire réponde — le handler Realtime UPDATE s'en charge
      _updateStore({ callState: 'calling' });
    } else {
      // Le répondant initie WebRTC immédiatement en tant qu'offerer
      _updateStore({ callState: 'connecting' });
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

          _updateStore({ incomingCall: call, callType: call.type, callState: 'ringing' });
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
            _updateStore({ callState: 'connecting' });
            await initZegoCall(updated.id, updated.type, false);
          }

          // Le partenaire a raccroché (status='answered' avec ended_at)
          if (updated.status === 'answered' && updated.ended_at && currentCallIdRef.current === updated.id) {
            if (callStateRef.current !== 'ended') {
              setOnRemoteStreamUpdate(null);
              setOnConnectionStateChange(null);
              await stopPublish().catch(() => {});
              await leaveRoom(updated.id).catch(() => {});
              _stopSharedTimer();
              if (_disconnectTimer) { clearTimeout(_disconnectTimer); _disconnectTimer = null; }
              _wasEverConnected = false;
              currentCallIdRef.current = null;
              _zegoInitializedCallId = null;
              _updateStore({ callState: 'ended' });
              setTimeout(() => _updateStore({ callState: 'idle' }), 2000);
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
            _stopSharedTimer();
            if (_disconnectTimer) { clearTimeout(_disconnectTimer); _disconnectTimer = null; }
            _wasEverConnected = false;
            currentCallIdRef.current = null;
            _zegoInitializedCallId = null;
            _updateStore({ callState: 'ended' });
            setTimeout(() => _updateStore({ callState: 'idle' }), 2000);
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

    _updateStore({ callType: type, callState: 'calling' });

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
      _updateStore({ callState: 'idle' });
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
    _updateStore({ incomingCall: null });

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
    _updateStore({ incomingCall: null, callState: 'idle' });
  }, [incomingCall]);

  // ─── RACCROCHER ───
  const endCall = useCallback(async () => {
    const callId = currentCallIdRef.current;
    if (!callId) return;
    stopRingtone();
    playCallEndSound();

    // wasAnswered utilise _wasEverConnected (flag module-level persistant)
    // plutôt que _store.callState, car le callback WebRTC 'disconnected'
    // peut déjà avoir mis le store à 'ended'.
    const wasAnswered = _wasEverConnected;
    const currentDuration = _store.callDuration;

    _updateStore({ callState: 'ended' });

    const remoteId = remoteStreamIdRef.current;
    if (remoteId) {
      await stopPlayingStream(remoteId).catch(() => {});
      remoteStreamIdRef.current = null;
    }

    setOnRemoteStreamUpdate(null);
    setOnConnectionStateChange(null);
    await stopPublish();
    await leaveRoom(callId);

    await supabase
      .from('calls')
      .update({
        status: wasAnswered ? 'answered' : 'cancelled',
        ended_at: new Date().toISOString(),
        duration_s: wasAnswered ? currentDuration : null,
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
              duration: wasAnswered ? currentDuration : 0,
              status: wasAnswered ? 'answered' : 'cancelled',
            }),
          });
        }
      }
    }

    _stopSharedTimer();
    if (_disconnectTimer) { clearTimeout(_disconnectTimer); _disconnectTimer = null; }
    _wasEverConnected = false;
    currentCallIdRef.current = null;
    _zegoInitializedCallId = null;

    setTimeout(() => {
      _updateStore({ callState: 'idle' });
      navigate(-1);
    }, 1000);
  }, [navigate]);

  // ─── Toggle Muet ───
  const toggleMute = useCallback(async () => {
    const v = !_store.isMuted;
    _updateStore({ isMuted: v });
    await muteMicrophone(v);
  }, []);

  // ─── Toggle Haut-parleur ───
  const toggleSpeakerFn = useCallback(async () => {
    const v = !_store.isSpeakerOn;
    _updateStore({ isSpeakerOn: v });
    await toggleSpeaker(v);
  }, []);

  // ─── Basculement caméra avant/arrière ───
  const switchCamera = useCallback(async (): Promise<boolean> => {
    try {
      return await switchCameraZego();
    } catch {
      return false;
    }
  }, []);

  const resetCall = useCallback(() => {
    _updateStore({
      callState: 'idle',
      incomingCall: null,
      callDuration: 0,
    });
    currentCallIdRef.current = null;
    _zegoInitializedCallId = null;
    _wasEverConnected = false;
    if (_disconnectTimer) { clearTimeout(_disconnectTimer); _disconnectTimer = null; }
    _stopSharedTimer();
  }, []);

  return {
    callState, callType, callDuration, isSpeakerOn, isMuted, incomingCall,
    startCall, answerCall, rejectCall, endCall, toggleMute, toggleSpeakerFn,
    switchCamera, resetCall,
  };
}
