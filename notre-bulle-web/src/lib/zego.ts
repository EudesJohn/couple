// ============================================================
// Couche d'abstraction Appels Audio/Vidéo — WebRTC
// Web uniquement (plus de Zego native mobile)
// ============================================================
import { supabase } from './supabase';

// ==========================================================
// Types
// ==========================================================
export const ZegoViewMode = {
  AspectFill: 0,
  AspectFit: 1,
} as const;

export type ZegoStream = any;

interface CallUser {
  userID: string;
  userName: string;
}

let onRemoteStreamUpdate: ((streams: any[], added: boolean) => void) | null = null;
let onConnectionStateChange: ((state: string) => void) | null = null;

export function setOnConnectionStateChange(cb: ((state: string) => void) | null): void {
  onConnectionStateChange = cb;
}

// ==========================================================
// WebRTC Implementation
// ==========================================================
class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteStreamId: string | null = null;
  private signalChannel: any = null;
  private callId: string = '';
  private isMuted: boolean = false;
  private isSpeakerOn: boolean = false;
  private offerSent: boolean = false;

  // Promise pour synchroniser handleOffer avec startPublish.
  // Quand l'offre SDP arrive avant la fin de getUserMedia, handleOffer
  // attend cette promesse pour que l'answer SDP inclue les pistes audio/vidéo.
  private localStreamPromise: Promise<void> | null = null;
  private resolveLocalStream: (() => void) | null = null;

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  async joinRoom(roomID: string, user: CallUser): Promise<void> {
    // Idempotent : si déjà dans cette room, ne pas recréer le PC
    if (this.callId === roomID && this.pc) return;

    // Nettoyer une éventuelle session précédente
    await this.leaveRoom();

    this.callId = roomID;

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal('ice-candidate', event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream!.addTrack(track);
      });

      const streamId = event.streams[0]?.id || 'remote';
      this.remoteStreamId = streamId;
      onRemoteStreamUpdate?.([{ streamID: streamId }], true);
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === 'connected') {
        onConnectionStateChange?.('connected');
      } else if (state === 'disconnected' || state === 'failed') {
        onConnectionStateChange?.(state!);
        onRemoteStreamUpdate?.([], false);
      }
    };

    this.signalChannel = supabase.channel(`webrtc:${roomID}`);

    this.signalChannel
      .on('broadcast', { event: 'sdp-offer' }, ({ payload }: any) => this.handleOffer(payload))
      .on('broadcast', { event: 'sdp-answer' }, ({ payload }: any) => this.handleAnswer(payload))
      .on('broadcast', { event: 'ice-candidate' }, ({ payload }: any) => this.handleIceCandidate(payload));

    await this.signalChannel.subscribe();
  }

  async startPublish(video: boolean = false): Promise<void> {
    if (this.localStream) return; // Déjà capturé

    // Créer la promesse AVANT getUserMedia pour que handleOffer puisse
    // l'attendre si l'offre SDP arrive avant la fin de la capture.
    this.localStreamPromise = new Promise<void>(resolve => {
      this.resolveLocalStream = resolve;
    });

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24 },
        } : false,
      });

      this.localStream.getTracks().forEach(track => {
        this.pc?.addTrack(track, this.localStream!);
      });
    } catch (err) {
      if (video) {
        // Fallback audio-only si la caméra n'est pas disponible
        console.warn('[WebRTC] Caméra indisponible, fallback audio only');
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.localStream.getTracks().forEach(track => {
            this.pc?.addTrack(track, this.localStream!);
          });
          return; // Succès audio-only
        } catch (audioErr) {
          console.error('[WebRTC] Micro indisponible aussi:', audioErr);
        }
      }
      console.error('[WebRTC] Erreur startPublish:', err);
      throw err;
    } finally {
      this.resolveLocalStream?.();
      this.localStreamPromise = null;
      this.resolveLocalStream = null;
    }
  }

  async createOffer(): Promise<void> {
    if (this.offerSent) return;
    this.offerSent = true;
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    await this.limitVideoBitrate();
    await this.sendSignal('sdp-offer', { sdp: offer.sdp, type: offer.type });
  }

  async handleOffer(payload: { sdp: string; type: string }): Promise<void> {
    if (!this.pc) return;

    // Attendre que le flux local soit disponible (getUserMedia + addTrack)
    // pour que l'answer SDP inclue les pistes audio/vidéo.
    // Résout le race condition : l'offre arrive avant la fin de getUserMedia.
    if (this.localStreamPromise) {
      await this.localStreamPromise;
    }

    // Polite peer : si on a déjà créé une offre locale, rollback pour accepter
    // l'offre distante (évite la collision SDP quand les deux publient)
    if (this.pc.signalingState === 'have-local-offer') {
      try {
        await this.pc.setLocalDescription({ type: 'rollback' });
      } catch {
        console.warn('[WebRTC] rollback non supporté, fermeture du PC');
        this.pc.close();
        this.pc = null;
        onRemoteStreamUpdate?.([], false);
        onConnectionStateChange?.('failed');
        return;
      }
    }

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription({ sdp: payload.sdp, type: payload.type as RTCSdpType }));

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.limitVideoBitrate();
      await this.sendSignal('sdp-answer', { sdp: answer.sdp, type: answer.type });
    } catch (err) {
      console.error('[WebRTC] Erreur handleOffer:', err);
    }
  }

  async handleAnswer(payload: { sdp: string; type: string }): Promise<void> {
    if (!this.pc) return;
    // Ignorer si déjà en état stable (connexion déjà établie)
    if (this.pc.signalingState === 'stable') return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription({ sdp: payload.sdp, type: payload.type as RTCSdpType }));
    } catch (err) {
      console.error('[WebRTC] Erreur handleAnswer:', err);
    }
  }

  async handleIceCandidate(payload: any): Promise<void> {
    if (!this.pc || !payload.candidate) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(payload));
    } catch (err) {
      console.warn('[WebRTC] Erreur ajout ICE candidate:', err);
    }
  }

  private async sendSignal(event: string, payload: any): Promise<void> {
    if (!this.signalChannel) return;
    await this.signalChannel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  // Limite le débit vidéo pour éviter les sauts d'image sur connexion mobile
  private async limitVideoBitrate(): Promise<void> {
    if (!this.pc) return;
    const senders = this.pc.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          // 500 kbps max — suffisant pour 480p fluide sans saturer le réseau
          params.encodings[0].maxBitrate = 500_000;
          await sender.setParameters(params).catch(() => {});
        } catch {
          // Silencieux si non supporté par le navigateur
        }
      }
    }
  }

  async leaveRoom(roomID?: string): Promise<void> {
    await this.stopPublish();

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.signalChannel) {
      await supabase.removeChannel(this.signalChannel);
      this.signalChannel = null;
    }

    this.remoteStream = null;
    this.remoteStreamId = null;
    this.callId = '';
    this.offerSent = false;
  }

  async stopPublish(): Promise<void> {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
  }

  async startPlayingStream(streamID: string): Promise<void> {
    // Web: le flux est déjà reçu via ontrack
  }

  async stopPlayingStream(streamID: string): Promise<void> {
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(t => t.stop());
      this.remoteStream = null;
    }
    this.remoteStreamId = null;
  }

  async toggleSpeaker(enabled: boolean): Promise<void> {
    this.isSpeakerOn = enabled;
    // Web: pas de contrôle de haut-parleur direct
  }

  async muteMicrophone(muted: boolean): Promise<void> {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  getLocalStream(): MediaStream | null { return this.localStream; }
  getRemoteStream(): MediaStream | null { return this.remoteStream; }
  getRemoteStreamId(): string | null { return this.remoteStreamId; }
  isAvailable(): boolean { return true; }
}

// ==========================================================
// Instance singleton
// ==========================================================
let webRTCInstance: WebRTCManager | null = null;

function getWebRTC(): WebRTCManager {
  if (!webRTCInstance) webRTCInstance = new WebRTCManager();
  return webRTCInstance;
}

// ==========================================================
// API publique
// ==========================================================

export async function isZegoAvailable(): Promise<boolean> {
  return true; // WebRTC toujours disponible
}

export function setPreviewView(view: any | undefined): void {
  // No-op sur web
}

export function setRemoteView(view: any | undefined): void {
  // No-op sur web
}

export function setOnRemoteStreamUpdate(cb: ((streams: any[], added: boolean) => void) | null): void {
  onRemoteStreamUpdate = cb;
}

export async function joinRoom(roomID: string, user: CallUser): Promise<void> {
  return getWebRTC().joinRoom(roomID, user);
}

export async function leaveRoom(roomID?: string): Promise<void> {
  return getWebRTC().leaveRoom(roomID);
}

/** @param video – demander la caméra (true pour appel vidéo, false/skip pour audio) */
export async function startPublish(video?: boolean): Promise<void> {
  return getWebRTC().startPublish(video ?? false);
}

export async function createOffer(): Promise<void> {
  return getWebRTC().createOffer();
}

export async function stopPublish(): Promise<void> {
  return getWebRTC().stopPublish();
}

export async function startPlayingStream(streamID: string): Promise<void> {
  return getWebRTC().startPlayingStream(streamID);
}

export async function stopPlayingStream(streamID: string): Promise<void> {
  return getWebRTC().stopPlayingStream(streamID);
}

export async function toggleSpeaker(enabled: boolean): Promise<void> {
  return getWebRTC().toggleSpeaker(enabled);
}

export async function muteMicrophone(muted: boolean): Promise<void> {
  return getWebRTC().muteMicrophone(muted);
}

export async function destroy(): Promise<void> {
  await getWebRTC().leaveRoom();
  webRTCInstance = null;
  onRemoteStreamUpdate = null;
}

// Exports spécifiques Web (pour la partie CallScreen)
export function getWebRTCStreams(): { local: MediaStream | null; remote: MediaStream | null; remoteStreamId: string | null } {
  if (!webRTCInstance) return { local: null, remote: null, remoteStreamId: null };
  return {
    local: webRTCInstance.getLocalStream(),
    remote: webRTCInstance.getRemoteStream(),
    remoteStreamId: webRTCInstance.getRemoteStreamId(),
  };
}
