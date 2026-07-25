// ============================================================
// Couche d'abstraction Appels Audio/Vidéo
// Web : WebRTC natif (RTCPeerConnection)
// Mobile : ZegoCloud (zego-express-engine-reactnative)
// ============================================================
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { config } from '../constants/config';

const isWeb = Platform.OS === 'web';

// ==========================================================
// Types communs
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

// ==========================================================
// WEB : WebRTC Implementation
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

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  async joinRoom(roomID: string, user: CallUser): Promise<void> {
    this.callId = roomID;

    // Créer la connexion pair
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    // Gérer les candidats ICE
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal('ice-candidate', event.candidate);
      }
    };

    // Gérer le flux distant
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
      if (this.pc?.connectionState === 'disconnected' || this.pc?.connectionState === 'failed') {
        onRemoteStreamUpdate?.([], false);
      }
    };

    // Canal de signalisation WebRTC via Supabase Realtime
    this.signalChannel = supabase.channel(`webrtc:${roomID}`);

    this.signalChannel
      .on('broadcast', { event: 'sdp-offer' }, ({ payload }: any) => this.handleOffer(payload))
      .on('broadcast', { event: 'sdp-answer' }, ({ payload }: any) => this.handleAnswer(payload))
      .on('broadcast', { event: 'ice-candidate' }, ({ payload }: any) => this.handleIceCandidate(payload));

    await this.signalChannel.subscribe();
  }

  async startPublish(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      // Ajouter les tracks locales au peer connection
      this.localStream.getTracks().forEach(track => {
        this.pc?.addTrack(track, this.localStream!);
      });

      // Créer et envoyer l'offre SDP
      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      await this.sendSignal('sdp-offer', { sdp: offer.sdp, type: offer.type });
    } catch (err) {
      console.error('[WebRTC] Erreur startPublish:', err);
      throw err;
    }
  }

  async handleOffer(payload: { sdp: string; type: string }): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(payload));

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.sendSignal('sdp-answer', { sdp: answer.sdp, type: answer.type });
  }

  async handleAnswer(payload: { sdp: string; type: string }): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
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
// MOBILE : ZegoCloud (natif)
// ==========================================================
let ZegoModule: any = null;
let engine: any = null;
let previewView: any = undefined;
let remoteView: any = undefined;

async function getZegoModule() {
  if (ZegoModule) return ZegoModule;
  try {
    ZegoModule = await import('zego-express-engine-reactnative');
    return ZegoModule;
  } catch { return null; }
}

async function getEngine() {
  if (engine) return engine;
  const Zego = await getZegoModule();
  if (!Zego) throw new Error('[Zego] Module non disponible');
  engine = await Zego.default.createEngineWithProfile({
    appID: config.zego.appID,
    appSign: config.zego.appSign,
    scenario: Zego.ZegoScenario.StandardVideoCall,
  });
  engine.on('roomStreamUpdate', (roomID: string, updateType: number, streamList: any[]) => {
    const added = updateType === 0;
    onRemoteStreamUpdate?.(streamList, added);
  });
  return engine;
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
// API publique (même interface que l'ancien Zego)
// ==========================================================

export async function isZegoAvailable(): Promise<boolean> {
  if (isWeb) return true; // WebRTC toujours disponible
  try {
    const mod = await getZegoModule();
    return mod !== null;
  } catch { return false; }
}

export function setPreviewView(view: any | undefined): void {
  if (isWeb) return;
  previewView = view;
}

export function setRemoteView(view: any | undefined): void {
  if (isWeb) return;
  remoteView = view;
}

export function setOnRemoteStreamUpdate(cb: ((streams: any[], added: boolean) => void) | null): void {
  onRemoteStreamUpdate = cb;
}

export async function joinRoom(roomID: string, user: CallUser): Promise<void> {
  if (isWeb) return getWebRTC().joinRoom(roomID, user);
  const zg = await getEngine();
  const result = await zg.loginRoom(roomID, { userID: user.userID, userName: user.userName }, { maxMemberCount: 2, isUserStatusNotify: true, token: '' });
  if (result.errorCode !== 0) throw new Error(`Échec connexion salon: code ${result.errorCode}`);
}

export async function leaveRoom(roomID?: string): Promise<void> {
  if (isWeb) return getWebRTC().leaveRoom(roomID);
  const zg = await getEngine();
  await zg.logoutRoom(roomID);
}

export async function startPublish(): Promise<void> {
  if (isWeb) return getWebRTC().startPublish();
  const zg = await getEngine();
  if (previewView) await zg.startPreview(previewView, undefined);
  await zg.startPublishingStream('stream_main', undefined, undefined);
}

export async function stopPublish(): Promise<void> {
  if (isWeb) return getWebRTC().stopPublish();
  const zg = await getEngine();
  await zg.stopPublishingStream(undefined);
  await zg.stopPreview(undefined);
}

export async function startPlayingStream(streamID: string): Promise<void> {
  if (isWeb) return getWebRTC().startPlayingStream(streamID);
  const zg = await getEngine();
  await zg.startPlayingStream(streamID, remoteView, undefined);
}

export async function stopPlayingStream(streamID: string): Promise<void> {
  if (isWeb) return getWebRTC().stopPlayingStream(streamID);
  const zg = await getEngine();
  await zg.stopPlayingStream(streamID);
}

export async function toggleSpeaker(enabled: boolean): Promise<void> {
  if (isWeb) return getWebRTC().toggleSpeaker(enabled);
  const zg = await getEngine();
  await zg.muteSpeaker(!enabled);
}

export async function muteMicrophone(muted: boolean): Promise<void> {
  if (isWeb) return getWebRTC().muteMicrophone(muted);
  const zg = await getEngine();
  await zg.muteMicrophone(muted);
}

export async function destroy(): Promise<void> {
  if (isWeb) {
    await getWebRTC().leaveRoom();
    webRTCInstance = null;
    return;
  }
  if (engine) {
    onRemoteStreamUpdate = null;
    const Zego = ZegoModule;
    await Zego?.default?.destroyEngine?.();
    engine = null;
    previewView = undefined;
    remoteView = undefined;
    ZegoModule = null;
  }
}

// Exports spécifiques Web (pour la partie CallScreen)
export function getWebRTCStreams(): { local: MediaStream | null; remote: MediaStream | null; remoteStreamId: string | null } {
  if (!isWeb || !webRTCInstance) return { local: null, remote: null, remoteStreamId: null };
  return {
    local: webRTCInstance.getLocalStream(),
    remote: webRTCInstance.getRemoteStream(),
    remoteStreamId: webRTCInstance.getRemoteStreamId(),
  };
}
