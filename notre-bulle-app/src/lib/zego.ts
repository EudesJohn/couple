// ============================================================
// Couche d'abstraction Appels Audio/Video - WebRTC
// Web : RTCPeerConnection navigateur (global)
// Mobile : react-native-webrtc (import natif)
// Signalisation = Supabase Realtime, ICE = STUN + TURN Metered
// ============================================================
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { config } from '../constants/config';

const isWeb = Platform.OS === 'web';

// ============================================================
// WebRTC natif - import conditionnel
// Sur mobile, RTCPeerConnection n'est PAS un global navigateur.
// ============================================================
let NativeRTC: any = null;
let webrtcNativeAvailable = false;

if (!isWeb) {
  try {
    NativeRTC = require('react-native-webrtc');
    webrtcNativeAvailable = true;
    console.log('[WebRTC] react-native-webrtc charge');
  } catch (err) {
    console.warn('[WebRTC] react-native-webrtc indisponible (Expo Go?) - appels desactives:', err);
  }
}

// Helpers - abstraction web/native
function createPC(cfg: any): any {
  if (isWeb) return new RTCPeerConnection(cfg);
  if (webrtcNativeAvailable) return new NativeRTC.RTCPeerConnection(cfg);
  throw new Error('WebRTC non disponible - utilisez un build custom (pas Expo Go)');
}

function makeSDP(desc: { sdp: string; type: string }): any {
  if (isWeb) return new RTCSessionDescription(desc as RTCSessionDescriptionInit);
  return new NativeRTC.RTCSessionDescription(desc);
}

function makeICE(c: any): any {
  if (isWeb) return new RTCIceCandidate(c);
  return new NativeRTC.RTCIceCandidate(c);
}

// ============================================================
// Types
// ============================================================
export const ZegoViewMode = { AspectFill: 0, AspectFit: 1 } as const;
export type ZegoStream = any;

interface CallUser { userID: string; userName: string; }

let onRemoteStreamUpdate: ((streams: any[], added: boolean) => void) | null = null;
let onConnectionStateChange: ((state: string) => void) | null = null;

export function setOnConnectionStateChange(cb: ((state: string) => void) | null): void {
  onConnectionStateChange = cb;
}

// InCallManager (speaker/ecouteur sur mobile)
let incallManager: any = null;
async function getIncallManager(): Promise<any> {
  if (incallManager) return incallManager;
  try {
    const mod = await import('react-native-incall-manager');
    incallManager = mod.default;
    return incallManager;
  } catch {
    return null;
  }
}

// ============================================================
// WebRTC Manager
// ============================================================
class WebRTCManager {
  private pc: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private remoteStreamId: string | null = null;
  private signalChannel: any = null;
  private callId = '';
  private offerSent = false;
  private pendingIceCandidates: any[] = [];
  private localStreamPromise: Promise<void> | null = null;
  private resolveLocalStream: (() => void) | null = null;
  private onRemoteStreamReady: ((stream: any) => void) | null = null;

  private async fetchIceServers(): Promise<any[]> {
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    if (config.meteredApiKey) {
      try {
        const res = await fetch(
          `https://notre-bulle-web.metered.live/api/v1/turn/credentials?apiKey=${config.meteredApiKey}`
        );
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d) && d.length > 0) return d;
        }
      } catch (err) {
        console.warn('[WebRTC] TURN Metered echoue, fallback STUN:', err);
      }
    }
    return servers;
  }

  setOnRemoteStreamReady(cb: ((stream: any) => void) | null): void {
    this.onRemoteStreamReady = cb;
  }

  async joinRoom(roomID: string, _user: CallUser): Promise<void> {
    if (this.callId === roomID && this.pc) return;
    await this.leaveRoom();
    this.callId = roomID;

    if (!isWeb && !webrtcNativeAvailable) {
      console.error('[WebRTC] Non disponible - build custom requis (pas Expo Go)');
      return;
    }

    const servers = await this.fetchIceServers();
    try {
      this.pc = createPC({ iceServers: servers });
    } catch (err) {
      console.error('[WebRTC] Impossible de creer RTCPeerConnection:', err);
      return;
    }

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) this.sendSignal('ice-candidate', event.candidate);
    };

    this.pc.ontrack = (event: any) => {
      if (!this.remoteStream) {
        this.remoteStream = event.streams?.[0] || null;
      } else if (event.streams?.[0]) {
        event.streams[0].getTracks?.().forEach((t: any) => {
          try { this.remoteStream.addTrack(t); } catch {}
        });
      }
      const streamId = event.streams?.[0]?.id || 'remote';
      this.remoteStreamId = streamId;
      if (this.remoteStream && this.onRemoteStreamReady) this.onRemoteStreamReady(this.remoteStream);
      onRemoteStreamUpdate?.([{ streamID: streamId }], true);
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState || this.pc?.iceConnectionState;
      console.log('[WebRTC] Etat:', state);
      if (state === 'connected') onConnectionStateChange?.('connected');
      else if (state === 'disconnected' || state === 'failed') {
        onConnectionStateChange?.(state);
        onRemoteStreamUpdate?.([], false);
      }
    };

    this.signalChannel = supabase.channel(`webrtc:${roomID}`);
    this.signalChannel
      .on('broadcast', { event: 'sdp-offer' }, ({ payload }: any) => this.handleOffer(payload))
      .on('broadcast', { event: 'sdp-answer' }, ({ payload }: any) => this.handleAnswer(payload))
      .on('broadcast', { event: 'ice-candidate' }, ({ payload }: any) => this.handleIceCandidate(payload))
      .on('broadcast', { event: 'offer-request' }, async () => {
        if (this.pc && this.offerSent && this.pc.signalingState === 'stable') {
          this.offerSent = false;
          await this.createOffer();
        }
      });

    await this.signalChannel.subscribe();
    console.log('[WebRTC] Canal webrtc rejoint:', roomID);
  }

  async startPublish(video: boolean = false): Promise<void> {
    if (this.localStream || !this.pc) return;

    this.localStreamPromise = new Promise<void>(resolve => { this.resolveLocalStream = resolve; });

    try {
      if (isWeb) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: video ? { width: { ideal: 480 }, height: { ideal: 288 }, frameRate: { ideal: 20 } } : false,
        });
      } else {
        if (!webrtcNativeAvailable || !NativeRTC?.mediaDevices) {
          throw new Error('react-native-webrtc mediaDevices non disponible');
        }
        // Demander les permissions AVANT getUserMedia
        try {
          const RN = await import('react-native');
          if (RN.PermissionsAndroid) {
            const perms: any[] = ['android.permission.RECORD_AUDIO'];
            if (video) perms.push('android.permission.CAMERA');
            const granted = await RN.PermissionsAndroid.requestMultiple(perms);
            const allGranted = Object.values(granted).every((v: any) => v === 'granted');
            if (!allGranted) console.warn('[WebRTC] Permissions non accordees:', granted);
          }
        } catch {}
        try {
          this.localStream = await NativeRTC.mediaDevices.getUserMedia({
            audio: true,
            video: video ? { facingMode: 'user', width: 480, height: 288, frameRate: 20 } : false,
          });
        } catch (err) {
          if (video) {
            console.warn('[WebRTC] Camera indisponible, fallback audio only');
            this.localStream = await NativeRTC.mediaDevices.getUserMedia({ audio: true, video: false });
          } else {
            throw err;
          }
        }
      }

      this.localStream.getTracks().forEach((track: any) => {
        this.pc.addTrack(track, this.localStream);
      });
      console.log('[WebRTC] Tracks publies:', this.localStream.getTracks().length);
    } catch (err) {
      console.error('[WebRTC] Erreur startPublish:', err);
    } finally {
      this.resolveLocalStream?.();
      this.localStreamPromise = null;
      this.resolveLocalStream = null;
    }
  }

  async createOffer(): Promise<void> {
    if (this.offerSent || !this.pc) return;
    this.offerSent = true;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.sendSignal('sdp-offer', { sdp: this.pc.localDescription.sdp, type: this.pc.localDescription.type });
      console.log('[WebRTC] Offre SDP envoyee');
    } catch (err) {
      console.error('[WebRTC] Erreur createOffer:', err);
    }
  }

  async handleOffer(payload: { sdp: string; type: string }): Promise<void> {
    if (!this.pc) return;
    if (this.localStreamPromise) await this.localStreamPromise;
    if (this.pc.signalingState === 'stable') return;

    try {
      await this.pc.setRemoteDescription(makeSDP(payload));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.sendSignal('sdp-answer', { sdp: this.pc.localDescription.sdp, type: this.pc.localDescription.type });
      await this.flushPendingIceCandidates();
      console.log('[WebRTC] Reponse SDP envoyee');
    } catch (err) {
      console.error('[WebRTC] Erreur handleOffer:', err);
    }
  }

  async handleAnswer(payload: { sdp: string; type: string }): Promise<void> {
    if (!this.pc) return;
    if (this.pc.signalingState === 'stable') return;
    try {
      await this.pc.setRemoteDescription(makeSDP(payload));
      await this.flushPendingIceCandidates();
      console.log('[WebRTC] Reponse SDP recue');
    } catch (err) {
      console.error('[WebRTC] Erreur handleAnswer:', err);
    }
  }

  async handleIceCandidate(payload: any): Promise<void> {
    if (!this.pc || !payload?.candidate) return;
    if (!this.pc.remoteDescription) {
      this.pendingIceCandidates.push(payload);
      return;
    }
    try {
      await this.pc.addIceCandidate(makeICE(payload));
    } catch (err) {
      console.warn('[WebRTC] Erreur ICE candidate:', err);
    }
  }

  private async flushPendingIceCandidates(): Promise<void> {
    while (this.pendingIceCandidates.length > 0) {
      const c = this.pendingIceCandidates.shift()!;
      if (!this.pc) break;
      try { await this.pc.addIceCandidate(makeICE(c)); } catch {}
    }
  }

  private async sendSignal(event: string, payload: any): Promise<void> {
    if (!this.signalChannel) return;
    await this.signalChannel.send({ type: 'broadcast', event, payload });
  }

  async leaveRoom(): Promise<void> {
    await this.stopPublish();
    if (this.pc) { try { this.pc.close(); } catch {} this.pc = null; }
    if (this.signalChannel) { await supabase.removeChannel(this.signalChannel); this.signalChannel = null; }
    this.remoteStream = null;
    this.remoteStreamId = null;
    this.callId = '';
    this.offerSent = false;
    this.pendingIceCandidates = [];
  }

  async stopPublish(): Promise<void> {
    if (this.localStream) {
      this.localStream.getTracks?.().forEach((t: any) => t.stop?.());
      this.localStream = null;
    }
  }

  async toggleSpeaker(enabled: boolean): Promise<void> {
    if (isWeb) return;
    try {
      const mgr = await getIncallManager();
      if (mgr) {
        try { mgr.start({ media: 'audio' }); } catch {}
        mgr.setForceSpeakerphoneOn(enabled ? 1 : -1);
      }
    } catch (err) {
      console.warn('[InCall] speaker:', err);
    }
  }

  async muteMicrophone(muted: boolean): Promise<void> {
    if (this.localStream) {
      this.localStream.getAudioTracks?.().forEach((t: any) => { t.enabled = !muted; });
    }
  }

  async switchCamera(): Promise<boolean> {
    if (!this.localStream || isWeb) return false;
    const vt = this.localStream.getVideoTracks?.()[0];
    if (!vt) return false;
    try { if (typeof vt.switchCamera === 'function') { await vt.switchCamera(); return true; } } catch {}
    return false;
  }

  getLocalStream(): any { return this.localStream; }
  getRemoteStream(): any { return this.remoteStream; }
  getRemoteStreamId(): string | null { return this.remoteStreamId; }
}

// ============================================================
// Singleton
// ============================================================
let webRTCInstance: WebRTCManager | null = null;
function getWebRTC(): WebRTCManager { if (!webRTCInstance) webRTCInstance = new WebRTCManager(); return webRTCInstance; }

// ============================================================
// API publique
// ============================================================
export async function isZegoAvailable(): Promise<boolean> { return isWeb || webrtcNativeAvailable; }
export function setPreviewView(_v: any): void {}
export function setRemoteView(_v: any): void {}
export function setOnRemoteStreamUpdate(cb: ((streams: any[], added: boolean) => void) | null): void { onRemoteStreamUpdate = cb; }
export function setOnRemoteStreamReady(cb: ((stream: any) => void) | null): void { getWebRTC().setOnRemoteStreamReady(cb); }
export async function joinRoom(roomID: string, user: CallUser): Promise<void> { return getWebRTC().joinRoom(roomID, user); }
export async function leaveRoom(_roomID?: string): Promise<void> { return getWebRTC().leaveRoom(); }
export async function startPublish(video?: boolean): Promise<void> { return getWebRTC().startPublish(video ?? false); }
export async function createOffer(): Promise<void> { return getWebRTC().createOffer(); }
export async function stopPublish(): Promise<void> { return getWebRTC().stopPublish(); }
export async function startPlayingStream(_id: string): Promise<void> {}
export async function stopPlayingStream(_id: string): Promise<void> {}
export async function toggleSpeaker(enabled: boolean): Promise<void> { return getWebRTC().toggleSpeaker(enabled); }
export async function muteMicrophone(muted: boolean): Promise<void> { return getWebRTC().muteMicrophone(muted); }
export async function switchCamera(): Promise<boolean> { return getWebRTC().switchCamera(); }
export async function destroy(): Promise<void> { await getWebRTC().leaveRoom(); webRTCInstance = null; onRemoteStreamUpdate = null; onConnectionStateChange = null; }

// ============================================================
// RTCView natif
// ============================================================
let RTCViewComponent: React.ComponentType<any> | null = null;
let RTCViewFailed = false;

export function getRTCView(): React.ComponentType<any> | null {
  if (RTCViewComponent) return RTCViewComponent;
  if (RTCViewFailed || isWeb) return null;
  try { RTCViewComponent = require('react-native-webrtc').RTCView; return RTCViewComponent; }
  catch { RTCViewFailed = true; return null; }
}

export function streamToUrl(stream: any | null): string | undefined {
  if (!stream || isWeb) return undefined;
  try { return stream.toURL?.(); } catch { return undefined; }
}

// ============================================================
// PiP (web)
// ============================================================
let _pipVideoElement: HTMLVideoElement | null = null;
let _pipWantsAudio = false;
const _pipListeners = new Set<() => void>();

export function setPipVideoElement(el: HTMLVideoElement | null): void { _pipVideoElement = el; }
export function setPipWantsAudio(v: boolean): void { if (_pipWantsAudio !== v) { _pipWantsAudio = v; _pipListeners.forEach(fn => fn()); } }
export function isPipWantsAudio(): boolean { return _pipWantsAudio; }
export function subscribePipWantsAudio(fn: () => void): () => void { _pipListeners.add(fn); return () => { _pipListeners.delete(fn); }; }

export function requestPictureInPicture(): boolean {
  if (isWeb && typeof document !== 'undefined') {
    const v = _pipVideoElement; if (!v) return false;
    v.muted = false; setPipWantsAudio(true);
    try { v.requestPictureInPicture().catch(() => setPipWantsAudio(false)); return true; }
    catch { setPipWantsAudio(false); return false; }
  }
  return false;
}
export function exitPictureInPicture(): void {
  setPipWantsAudio(false);
  if (isWeb && typeof document !== 'undefined') {
    document.pictureInPictureElement && document.exitPictureInPicture().catch(() => {});
    if (_pipVideoElement) _pipVideoElement.muted = true;
  }
}
export function isPiPSupported(): boolean {
  if (!isWeb || typeof document === 'undefined') return false;
  return 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
}

// ============================================================
// Acces aux flux
// ============================================================
export function getWebRTCStreams() {
  if (!webRTCInstance) return { local: null, remote: null, remoteStreamId: null };
  return { local: webRTCInstance.getLocalStream(), remote: webRTCInstance.getRemoteStream(), remoteStreamId: webRTCInstance.getRemoteStreamId() };
}
