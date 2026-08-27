// ============================================================
// CallStore — État global des appels (singleton)
//
// Remplace l'ancien hook useCall dont CHAQUE instance créait son
// propre état isolé (l'écran d'appel ne pouvait ni raccrocher ni
// voir le timer). Le store est partagé par toute l'app : header,
// écran d'appel, bannière d'appel entrant et notifications.
//
// Signaling : Supabase Realtime + WebRTC (src/lib/zego.ts)
// ============================================================
import { supabase, getCurrentProfile } from './supabase';
import {
  joinRoom, leaveRoom, startPublish, stopPublish, toggleSpeaker,
  muteMicrophone, startPlayingStream, stopPlayingStream,
  setOnRemoteStreamUpdate, setOnConnectionStateChange, createOffer,
  switchCamera as switchCameraZego,
} from './zego';
import type { Call, CallType } from '../types/database';
import { router } from 'expo-router';
import {
  notifyIncomingCall, clearIncomingCallNotification,
} from '../hooks/useNotifications';

export type CallStateType = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export interface CallStoreState {
  callState: CallStateType;
  callType: CallType;
  callDuration: number;
  isSpeakerOn: boolean;
  isMuted: boolean;
  incomingCall: Call | null;
}

type Listener = () => void;

const INITIAL_STATE: CallStoreState = {
  callState: 'idle',
  callType: 'audio',
  callDuration: 0,
  isSpeakerOn: false,
  isMuted: false,
  incomingCall: null,
};

class CallStore {
  private state: CallStoreState = INITIAL_STATE;
  private listeners = new Set<Listener>();

  private profileRef: { id: string; name: string } | null = null;
  private partnerRef: { id: string; name: string } | null = null;
  private currentCallIdRef: string | null = null;
  private callTimerRef: ReturnType<typeof setInterval> | null = null;
  private remoteStreamIdRef: string | null = null;
  // Flag : l'appel a déjà été connecté (pour wasAnswered dans endCall)
  private wasEverConnectedRef = false;
  // Timer de grâce pour 'disconnected' — WebRTC peut se reconnecter
  private disconnectTimerRef: ReturnType<typeof setTimeout> | null = null;
  // Canal Realtime initialisé une seule fois
  private initialized = false;

  // ─── Abonnement (useSyncExternalStore) ───
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getState = (): CallStoreState => this.state;

  private setState(
    patch: Partial<CallStoreState> | ((current: CallStoreState) => Partial<CallStoreState>)
  ): void {
    const resolved = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...resolved };
    this.listeners.forEach((l) => l());
  }

  // ─── Initialisation (une seule fois par session) ───
  private callsChannel: any = null;
  ensureInit(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.loadProfiles();
    this.setupRealtime();
  }

  private async loadProfiles(): Promise<void> {
    try {
      const me = await getCurrentProfile();
      if (!me) return;
      this.profileRef = { id: me.id, name: me.display_name };

      const { getActualPartnerProfileId } = await import('./profile');
      const partnerId = await getActualPartnerProfileId();
      if (partnerId) {
        const { data: partner } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('id', partnerId)
          .single();
        if (partner) {
          this.partnerRef = { id: partner.id, name: partner.display_name };
        }
      }
    } catch (err) {
      console.warn('[CallStore] Erreur chargement profils:', err);
    }
  }

  getPartnerName(): string {
    return this.partnerRef?.name || 'Partenaire';
  }

  // ─── Timer ───
  private startCallTimer(): void {
    this.setState({ callDuration: 0 });
    this.callTimerRef = setInterval(() => {
      this.setState({ callDuration: this.state.callDuration + 1 });
    }, 1000);
  }

  private stopCallTimer(): void {
    if (this.callTimerRef) {
      clearInterval(this.callTimerRef);
      this.callTimerRef = null;
    }
  }

  // ─── Realtime : écouter les appels entrants ───
  private setupRealtime(): void {
    // Guard : si le canal existe déjà (React StrictMode double-mount), ne pas recréer
    if (this.callsChannel) return;
    const channel = supabase
      .channel('calls:live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        async (payload) => {
          const call = payload.new as Call;
          const me = await getCurrentProfile();
          if (!me || call.caller_id === me.id) return; // c'est nous qui appelons

          // Appel entrant — notification système + état partagé
          this.setState({ incomingCall: call, callType: call.type, callState: 'ringing' });
          notifyIncomingCall(this.getPartnerName(), call.type, call.id);
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
            this.currentCallIdRef === updated.id
          ) {
            this.setState({ callState: 'connecting' });
            // L'appelant a reçu la réponse → non-offerer, attend l'offre du callee
            await this.initWebRTCCall(updated.id, updated.type, false);
          }

          // L'autre a rejeté / annulé
          if (
            (updated.status === 'cancelled' || updated.status === 'failed') &&
            this.currentCallIdRef === updated.id
          ) {
            this.markEnded();
          }
        }
      )
      .subscribe();
    this.callsChannel = channel;
  }

  private markEnded(): void {
    clearIncomingCallNotification();
    this.setState({ callState: 'ended' });
    setTimeout(() => {
      this.setState((s) => ({ callState: s.callState === 'ended' ? 'idle' : s.callState }));
    }, 2000);
  }

  // ─── Initialiser WebRTC (callee = offerer) ───
  private initWebRTCCall = async (callId: string, type: CallType, isOfferer: boolean): Promise<void> => {
    const me = this.profileRef;
    if (!me) return;

    setOnConnectionStateChange((state) => {
      // 'disconnected' est temporaire — WebRTC peut se reconnecter
      // (réseau mobile instable, transition WiFi/4G). On donne 5s de grâce.
      // 'failed' = irrécupérable → on coupe immédiatement.
      if (state === 'failed') {
        if (this.disconnectTimerRef) { clearTimeout(this.disconnectTimerRef); this.disconnectTimerRef = null; }
        this.markEnded();
      } else if (state === 'disconnected') {
        if (this.disconnectTimerRef) return;
        this.disconnectTimerRef = setTimeout(() => {
          this.disconnectTimerRef = null;
          if (this.state.callState === 'connected') this.markEnded();
        }, 10000);
      } else if (state === 'connected') {
        if (this.disconnectTimerRef) {
          clearTimeout(this.disconnectTimerRef);
          this.disconnectTimerRef = null;
        }
      }
    });

    // Jouer le flux distant quand il apparaît
    setOnRemoteStreamUpdate((streams, added) => {
      if (added && streams.length > 0) {
        const sid = streams[0].streamID;
        this.remoteStreamIdRef = sid;
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
        await new Promise((r) => setTimeout(r, 1500));
        await createOffer();
      }

      this.setState({ callState: 'connected' });
      this.wasEverConnectedRef = true;
      this.startCallTimer();
    } catch (err) {
      console.error('Erreur WebRTC:', err);
      this.markEnded();
    }
  };

  // ─── LANCER un appel ───
  startCall = async (type: CallType): Promise<void> => {
    const me = this.profileRef;
    if (!me) {
      // Profils pas encore chargés → réessayer
      await this.loadProfiles();
      if (!this.profileRef) return;
      return this.startCall(type);
    }

    this.setState({ callType: type, callState: 'calling' });

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
      this.setState({ callState: 'idle' });
      return;
    }

    this.currentCallIdRef = call.id;
    router.push(`/call?callId=${call.id}&type=${type}&role=caller`);
  };

  // ─── RÉPONDRE ───
  answerCall = async (): Promise<void> => {
    let incoming = this.state.incomingCall;
    if (!incoming) return;
    const callId = incoming.id;
    this.currentCallIdRef = callId;
    this.setState({ callState: 'connecting', incomingCall: null });
    clearIncomingCallNotification();

    await supabase
      .from('calls')
      .update({ status: 'answered', answered_at: new Date().toISOString() })
      .eq('id', callId);

    // D'abord initialiser WebRTC (joinRoom + startPublish) AVANT la navigation
    // pour que le canal de signalisation soit prêt quand l'écran d'appel se monte.
    try {
      const me = this.profileRef;
      if (me) {
        const { joinRoom, startPublish, createOffer } = await import('./zego');
        setOnConnectionStateChange((state) => {
          if (state === 'failed') {
            if (this.disconnectTimerRef) { clearTimeout(this.disconnectTimerRef); this.disconnectTimerRef = null; }
            this.markEnded();
          } else if (state === 'disconnected') {
            if (this.disconnectTimerRef) return;
            this.disconnectTimerRef = setTimeout(() => {
              this.disconnectTimerRef = null;
              if (this.state.callState === 'connected') this.markEnded();
            }, 8000);
          } else if (state === 'connected') {
            if (this.disconnectTimerRef) {
              clearTimeout(this.disconnectTimerRef);
              this.disconnectTimerRef = null;
            }
          }
        });
        setOnRemoteStreamUpdate((streams, added) => {
          if (added && streams.length > 0) {
            const sid = streams[0].streamID;
            this.remoteStreamIdRef = sid;
            import('./zego').then(z => z.startPlayingStream(sid).catch(() => {}));
          }
        });
        await joinRoom(callId, { userID: me.id, userName: me.name });
        await startPublish(incoming.type === 'video');
        this.setState({ callState: 'connected' });
        this.wasEverConnectedRef = true;
        this.startCallTimer();
        // Petite attente pour que le caller rejoigne le canal avant l'offre
        await new Promise((r) => setTimeout(r, 1500));
        await createOffer();
      }
    } catch (err) {
      console.error('[CallStore] Erreur WebRTC answer:', err);
      this.markEnded();
      return;
    }

    // Naviguer APRÈS avoir établi la connexion WebRTC
    router.push(`/call?callId=${callId}&type=${incoming.type}&role=callee`);
    void incoming;
  };

  /**
   * Décrocher depuis une NOTIFICATION (app en arrière-plan ou froid).
   * Recharge la ligne `call` depuis Supabase puis répond.
   */
  answerFromNotification = async (callId: string): Promise<void> => {
    if (this.state.incomingCall?.id === callId) {
      return this.answerCall();
    }
    try {
      const { data: call } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .single();
      if (!call) return;
      this.setState({ incomingCall: call as Call });
      return this.answerCall();
    } catch (err) {
      console.warn('[CallStore] answerFromNotification:', err);
    }
  };

  // ─── REJETER ───
  rejectCall = async (): Promise<void> => {
    const incoming = this.state.incomingCall;
    if (!incoming) return;
    clearIncomingCallNotification();
    await supabase.from('calls').update({ status: 'failed' }).eq('id', incoming.id);
    this.setState({ incomingCall: null, callState: 'idle' });
  };

  // ─── RACCROCHER ───
  endCall = async (): Promise<void> => {
    const callId = this.currentCallIdRef;
    if (!callId) return;
    clearIncomingCallNotification();
    this.setState({ callState: 'ended' });

    // Arrêter le flux distant
    const remoteId = this.remoteStreamIdRef;
    if (remoteId) {
      await stopPlayingStream(remoteId).catch(() => {});
      this.remoteStreamIdRef = null;
    }

    setOnRemoteStreamUpdate(null);
    setOnConnectionStateChange(null);
    if (this.disconnectTimerRef) { clearTimeout(this.disconnectTimerRef); this.disconnectTimerRef = null; }
    await stopPublish();
    await leaveRoom(callId);

    const wasAnswered = this.wasEverConnectedRef;
    await supabase
      .from('calls')
      .update({
        status: wasAnswered ? 'answered' : 'cancelled',
        ended_at: new Date().toISOString(),
        duration_s: wasAnswered ? this.state.callDuration : null,
      })
      .eq('id', callId);

    this.stopCallTimer();
    this.currentCallIdRef = null;
    this.wasEverConnectedRef = false;

    setTimeout(() => {
      this.setState({ callState: 'idle' });
      if (router.canGoBack()) router.back();
    }, 1000);
  };

  // ─── Contrôles ───
  toggleMute = async (): Promise<void> => {
    const v = !this.state.isMuted;
    this.setState({ isMuted: v });
    await muteMicrophone(v);
  };

  toggleSpeakerFn = async (): Promise<void> => {
    const v = !this.state.isSpeakerOn;
    this.setState({ isSpeakerOn: v });
    await toggleSpeaker(v);
  };

  switchCamera = async (): Promise<boolean> => {
    try {
      return await switchCameraZego();
    } catch {
      return false;
    }
  };

  resetCall = (): void => {
    clearIncomingCallNotification();
    this.setState({
      callState: 'idle',
      incomingCall: null,
      callDuration: 0,
    });
    this.currentCallIdRef = null;
    this.wasEverConnectedRef = false;
    if (this.disconnectTimerRef) { clearTimeout(this.disconnectTimerRef); this.disconnectTimerRef = null; }
    this.stopCallTimer();
  };
}

// ============================================================
// Instance singleton
// ============================================================
export const callStore = new CallStore();
