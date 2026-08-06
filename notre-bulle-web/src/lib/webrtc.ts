// ============================================================
// Couche d'abstraction Appels Audio/Vidéo — WebRTC
// Web : RTCPeerConnection + signalisation Supabase Realtime
// ============================================================
import { supabase } from './supabase';
import { config } from '../constants/config';

// ==========================================================
// Types (rétrocompatibles)
// ==========================================================
type StreamID = string;

interface CallUser {
  userID: string;
  userName: string;
}

let onRemoteStreamUpdate: ((streams: any[], added: boolean) => void) | null = null;
let onConnectionStateChange: ((state: string) => void) | null = null;

// Callback déclenché quand le partenaire bascule l'appel audio → vidéo.
// Permet à l'autre côté de passer son UI en mode vidéo (bouton caméra).
let onUpgradeToVideo: (() => void) | null = null;

export function setOnUpgradeToVideo(cb: (() => void) | null): void {
  onUpgradeToVideo = cb;
}

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

  // File d'attente ICE candidates : quand les candidats arrivent avant
  // que setRemoteDescription soit appelé, on les stocke ici et on les
  // rejoue après l'établissement de la session (évite InvalidStateError)
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  // Promise pour synchroniser handleOffer avec startPublish.
  // Quand l'offre SDP arrive avant la fin de getUserMedia, handleOffer
  // attend cette promesse pour que l'answer SDP inclue les pistes audio/vidéo.
  private localStreamPromise: Promise<void> | null = null;
  private resolveLocalStream: (() => void) | null = null;

  // Callback appelé immédiatement quand le flux distant change
  // (évite le polling 500ms dans CallScreen qui cause des sauts)
  private onRemoteStreamReady: ((stream: MediaStream) => void) | null = null;

  // Récupère les credentials TURN frais depuis l'API Metered.ca
  private async fetchIceServers(): Promise<RTCIceServer[]> {
    const servers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // Si une clé Metered est configurée, récupérer des credentials TURN
    // frais via l'API REST (évite l'expiration des credentials statiques)
    if (config.meteredApiKey) {
      try {
        const res = await fetch(
          `https://notre-bulle-web.metered.live/api/v1/turn/credentials?apiKey=${config.meteredApiKey}`
        );
        if (res.ok) {
          const dynamic = await res.json();
          if (Array.isArray(dynamic) && dynamic.length > 0) {
            // L'API Metered retourne un tableau d'ICE servers complets
            return dynamic;
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Échec récupération TURN Metered, fallback STUN:', err);
      }
    }

    return servers;
  }

  setOnRemoteStreamReady(cb: ((stream: MediaStream) => void) | null): void {
    this.onRemoteStreamReady = cb;
  }

  async joinRoom(roomID: string, user: CallUser): Promise<void> {
    // Idempotent : si déjà dans cette room, ne pas recréer le PC
    if (this.callId === roomID && this.pc) return;

    // Nettoyer une éventuelle session précédente
    await this.leaveRoom();

    this.callId = roomID;

    const servers = await this.fetchIceServers();
    this.pc = new RTCPeerConnection({ iceServers: servers });

    // Forcer H264 (encodage matériel sur mobile) pour réduire les sauts d'image
    this.preferH264Codec();

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal('ice-candidate', event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      // Garde-fou : streams[0] peut être absent sur certains navigateurs
      // (piste ajoutée sans association à un flux). On ajoute quand même la
      // piste au flux distant partagé.
      const stream = event.streams[0];
      if (stream) {
        stream.getTracks().forEach(track => {
          this.remoteStream!.addTrack(track);
        });
      } else {
        event.track && this.remoteStream.addTrack(event.track);
      }

      const streamId = stream?.id || 'remote';
      this.remoteStreamId = streamId;

      // Callback immédiat pour que CallScreen attache le flux sans délai
      if (this.remoteStream && this.onRemoteStreamReady) {
        this.onRemoteStreamReady(this.remoteStream);
      }

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
      .on('broadcast', { event: 'ice-candidate' }, ({ payload }: any) => this.handleIceCandidate(payload))
      // Passage audio → vidéo demandé par le partenaire : basculer notre UI en vidéo
      .on('broadcast', { event: 'upgrade-to-video' }, () => onUpgradeToVideo?.());

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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: video ? {
          width: { ideal: 480, max: 640 },
          height: { ideal: 288, max: 480 },
          frameRate: { ideal: 20, max: 24 },
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
      // Rejouer les ICE candidates arrivés avant le setRemoteDescription
      await this.flushPendingIceCandidates();
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
      // Rejouer les ICE candidates arrivés avant le setRemoteDescription
      await this.flushPendingIceCandidates();
    } catch (err) {
      console.error('[WebRTC] Erreur handleAnswer:', err);
    }
  }

  async handleIceCandidate(payload: any): Promise<void> {
    if (!this.pc || !payload.candidate) return;

    // Si la description distante n'est pas encore définie, bufferiser
    // le candidat pour le rejouer plus tard (évite InvalidStateError)
    if (!this.pc.remoteDescription) {
      this.pendingIceCandidates.push(payload);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(payload));
    } catch (err) {
      console.warn('[WebRTC] Erreur ajout ICE candidate:', err);
    }
  }

  // Rejouer les ICE candidates mis en attente après setRemoteDescription
  private async flushPendingIceCandidates(): Promise<void> {
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift()!;
      if (!this.pc) break;
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTC] Erreur ICE candidate différé:', err);
      }
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

  // Limite le débit vidéo et configure l'adaptation réseau pour éviter
  // les sauts d'image sur connexion mobile.
  private async limitVideoBitrate(): Promise<void> {
    if (!this.pc) return;
    const senders = this.pc.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          // 300 kbps max — suffisant pour 360p fluide sans saturer le réseau mobile
          params.encodings[0].maxBitrate = 300_000;
          // Prioriser le maintien du framerate : baisse la qualité avant de réduire les fps
          (params.encodings[0] as any).degradationPreference = 'maintain-framerate';
          await sender.setParameters(params).catch(() => {});
        } catch {
          // Silencieux si non supporté par le navigateur
        }
      }
    }
  }

  // Forcer H264 (broadcom/qualcomm hardware encode) — bien plus fluide sur mobile
  // que VP8/VP9 qui sont encodés en software sur la plupart des appareils iOS/Android
  private preferH264Codec(): void {
    if (!this.pc || !this.pc.getTransceivers) return;
    try {
      const caps = RTCRtpSender.getCapabilities('video');
      if (!caps?.codecs) return;
      // Trier les codecs : H264 en premier, le reste ensuite
      const h264 = caps.codecs.filter(c => c.mimeType.toLowerCase().includes('h264'));
      const other = caps.codecs.filter(c => !c.mimeType.toLowerCase().includes('h264'));
      const preferred = [...h264, ...other];
      for (const tr of this.pc.getTransceivers()) {
        if (tr.receiver?.track?.kind === 'video' && tr.setCodecPreferences) {
          tr.setCodecPreferences(preferred);
        }
      }
    } catch {
      // Silencieux si setCodecPreferences non supporté
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
    this.pendingIceCandidates = [];
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

  async switchCamera(): Promise<boolean> {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;

    try {
      // Étape 1 : énumérer les caméras disponibles — utiliser deviceId
      // (plus fiable que facingMode qui n'est pas uniforme selon les navigateurs)
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const cams = allDevices.filter(d => d.kind === 'videoinput');

      // Étape 2 : trouver une caméra différente de l'actuelle
      const curId = videoTrack.getSettings()?.deviceId;
      let nextCam: MediaDeviceInfo | undefined;

      if (curId && cams.length >= 2) {
        nextCam = cams.find(d => d.deviceId !== curId);
      } else if (cams.length >= 2) {
        nextCam = cams[cams.length - 1];
      }

      // Étape 3 : capturer la nouvelle caméra
      //   Tentative 1 : avec l'ancienne caméra active (switch instantané)
      //   Tentative 2 : si échec, libérer l'ancienne et réessayer
      let newStream: MediaStream;

      // Fonction helper pour getUserMedia (deviceId ou facingMode fallback)
      const tryCapture = async (device: MediaDeviceInfo | undefined): Promise<MediaStream> => {
        if (device) {
          return navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: device.deviceId },
              width: { ideal: 480, max: 640 },
              height: { ideal: 288, max: 480 },
              frameRate: { ideal: 20, max: 24 },
            },
            audio: false,
          });
        }
        // Fallback facingMode
        const facing = videoTrack.getSettings()?.facingMode || 'user';
        const nf = facing === 'user' ? 'environment' : 'user';
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: nf }, width: { ideal: 480, max: 640 }, height: { ideal: 288, max: 480 }, frameRate: { ideal: 20, max: 24 } },
            audio: false,
          });
        } catch {
          return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: nf, width: { ideal: 480, max: 640 }, height: { ideal: 288, max: 480 }, frameRate: { ideal: 20, max: 24 } },
            audio: false,
          });
        }
      };

      try {
        // Tentative 1 : ancienne caméra encore active (pas de coupure vidéo)
        newStream = await tryCapture(nextCam);
      } catch (_firstErr) {
        // Échec → libérer l'ancienne caméra et réessayer
        this.localStream.removeTrack(videoTrack);
        videoTrack.stop();
        newStream = await tryCapture(nextCam);
      }

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return false;

      // Étape 4 : remplacer dans le RTCPeerConnection
      const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
      } else {
        this.pc?.addTrack(newTrack, this.localStream);
      }

      // Étape 5 : ajouter la nouvelle piste au flux local
      this.localStream.addTrack(newTrack);

      // Étape 6 : arrêter l'ancienne piste si elle est toujours active
      if (videoTrack.readyState !== 'ended') {
        this.localStream.removeTrack(videoTrack);
        videoTrack.stop();
      }

      return true;
    } catch (err) {
      console.warn('[WebRTC] Échec basculement caméra:', err);
      return false;
    }
  }

  // ==========================================================
  // Passage audio → vidéo en cours d'appel (rénégociation SDP)
  // ==========================================================

  /** Active la caméra locale et renégocie pour envoyer la vidéo au partenaire.
   *  Idempotent : ne fait rien si une piste vidéo locale est déjà active. */
  async enableVideo(): Promise<boolean> {
    if (this.localStream?.getVideoTracks().length) return true; // déjà en vidéo

    try {
      // Étape 1 : capturer la caméra (mêmes contraintes qu'à l'init de l'appel)
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480, max: 640 },
          height: { ideal: 288, max: 480 },
          frameRate: { ideal: 20, max: 24 },
        },
        audio: false,
      });
      const vTrack = videoStream.getVideoTracks()[0];
      if (!vTrack) {
        videoStream.getTracks().forEach(t => t.stop());
        return false;
      }

      // Étape 2 : ajouter la piste au flux local (en appel audio, il contient déjà l'audio)
      if (!this.localStream) this.localStream = new MediaStream();
      this.localStream.addTrack(vTrack);

      // Étape 3 : envoyer la piste via la RTCPeerConnection (nouveau sender)
      if (this.pc) this.pc.addTrack(vTrack, this.localStream);

      // Étape 4 : prévenir le partenaire (bascule d'UI) puis renégocier l'offre SDP.
      // Le broadcast part en premier pour que le partenaire affiche la vidéo dès
      // que la piste arrive (l'ordre des deux messages n'est pas garanti).
      await this.sendUpgradeToVideo();
      await this.renegotiate();
      return true;
    } catch (err) {
      console.warn('[WebRTC] Échec activation vidéo:', err);
      return false;
    }
  }

  isVideoEnabled(): boolean {
    return !!this.localStream?.getVideoTracks().length;
  }

  private async renegotiate(): Promise<void> {
    if (!this.pc) return;
    // Pas de garde offerSent ici : on veut pouvoir renégocier à volonté
    // (ajout d'une piste vidéo en cours d'appel).
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.limitVideoBitrate();
    await this.sendSignal('sdp-offer', { sdp: offer.sdp, type: offer.type });
  }

  private async sendUpgradeToVideo(): Promise<void> {
    if (!this.signalChannel) return;
    await this.signalChannel.send({ type: 'broadcast', event: 'upgrade-to-video', payload: {} });
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

export async function isWebRTCAvailable(): Promise<boolean> {
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

export function setOnRemoteStreamReady(cb: ((stream: MediaStream) => void) | null): void {
  getWebRTC().setOnRemoteStreamReady(cb);
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

export async function switchCamera(): Promise<boolean> {
  return getWebRTC().switchCamera();
}

/** Active la caméra pour passer un appel audio en appel vidéo à la volée. */
export async function enableVideo(): Promise<boolean> {
  return getWebRTC().enableVideo();
}

/** Vrai si la caméra locale est déjà active. */
export function isVideoEnabled(): boolean {
  return getWebRTC().isVideoEnabled();
}

export async function destroy(): Promise<void> {
  await getWebRTC().leaveRoom();
  webRTCInstance = null;
  onRemoteStreamUpdate = null;
}

// ==========================================================
// Picture-in-Picture (PiP) — fenêtre flottante OS
// L'élément vidéo PiP vit dans CallOverlay (persistant) et
// est enregistré ici via setPipVideoElement.
// ==========================================================
let _pipVideoElement: HTMLVideoElement | null = null;

export function setPipVideoElement(el: HTMLVideoElement | null): void {
  _pipVideoElement = el;
}

// ──────────────────────────────────────────────────────────────
// État partagé « la fenêtre PiP doit être audible ».
//
// Le problème corrigé ici : `requestPictureInPicture()` retire la
// sourdine de l'élément IMPÉRATIVEMENT dans le geste utilisateur, mais
// l'événement asynchrone `enterpictureinpicture` ne se déclenche que
// PLUS TARD. Entre les deux, CallOverlay re-render (le timer de durée
// tick chaque seconde) et la prop `muted={!pipShouldBeAudible}` (dont
// isInPip est encore false) re-mutait l'élément. Chrome Android « loque »
// l'état muet de la fenêtre PiP à l'ouverture : même démuté ensuite, le
// PiP reste muet → audio coupé en entrant en PiP, vidéo comme audio.
//
// Solution : positionner ce flag SYNCHRONEMENT dans le geste (avant la
// demande), et le faire refléter en état React par CallOverlay, pour que
// `pipShouldBeAudible` soit vrai dès le premier re-render qui suit le
// geste. Plus aucun re-render ne peut re-muter l'élément pendant
// l'ouverture de la fenêtre.
// ──────────────────────────────────────────────────────────────
let _pipWantsAudio = false;
const _pipListeners = new Set<() => void>();

export function setPipWantsAudio(v: boolean): void {
  if (_pipWantsAudio === v) return;
  _pipWantsAudio = v;
  _pipListeners.forEach(fn => fn());
}
export function isPipWantsAudio(): boolean {
  return _pipWantsAudio;
}
export function subscribePipWantsAudio(fn: () => void): () => void {
  _pipListeners.add(fn);
  return () => { _pipListeners.delete(fn); };
}

/** Appelle requestPictureInPicture sur l'élément vidéo PiP.
 *  Doit être appelé dans un gestionnaire d'événement utilisateur
 *  (click, touch) pour respecter la contrainte navigateur. */
export function requestPictureInPicture(): boolean {
  const video = _pipVideoElement;
  if (!video) return false;
  if (document.pictureInPictureElement) {
    setPipWantsAudio(true);
    return true; // déjà en PiP
  }

  // La fenêtre PiP doit être AUDIBLE. Trois choses, DANS le geste :
  //  1. On retire la sourdine AVANT la demande — sinon Chrome crée une
  //     fenêtre PiP muette (état loché à l'ouverture sur Android).
  //  2. On s'assure que l'élément est EN LECTURE (pas en pause) : une fenêtre
  //     PiP ouverte sur un élément en pause peut figer l'audio au démarrage.
  //  3. setPipWantsAudio(true) SYNCHRONE : CallOverlay re-render tout de
  //     suite avec pipShouldBeAudible = true, donc la prop React ne re-mutera
  //     jamais l'élément pendant l'ouverture (voir explication ci-dessus).
  video.muted = false;
  if (video.paused) {
    video.play().catch(() => {});
  }
  // Fallback : si la métadonnée vidéo n'a pas encore chargé, on donne un format
  // de base à la fenêtre au moment de l'ouverture (évite une fenêtre 1×1
  // aplatie/déformée et le mauvais routage audio qui va avec). Le reste du
  // temps, la taille est pilotée par l'état React `pipVideoSize` de CallOverlay
  // (loadedmetadata / resize).
  if (video.videoWidth && video.videoHeight) {
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, 1));
    video.style.width = `${Math.round(video.videoWidth * scale)}px`;
    video.style.height = `${Math.round(video.videoHeight * scale)}px`;
  }
  setPipWantsAudio(true);

  try {
    video.requestPictureInPicture().catch((err: any) => {
      console.warn('[PiP] Erreur entrée PiP:', err);
      setPipWantsAudio(false);
      video.muted = true; // restauration si l'entrée en PiP a échoué
    });
    return true;
  } catch (err) {
    console.warn('[PiP] Erreur entrée PiP:', err);
    setPipWantsAudio(false);
    video.muted = true;
    return false;
  }
}

export function exitPictureInPicture(): void {
  setPipWantsAudio(false);
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
  // Remettre la sourdine : hors PiP, l'audio est rendu par l'élément
  // vidéo principal (CallScreen / overlay), pas par l'élément PiP.
  if (_pipVideoElement) {
    _pipVideoElement.muted = true;
  }
}

/** Vérifie si le navigateur supporte l'API Picture-in-Picture */
export function isPiPSupported(): boolean {
  return 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
}

// ==========================================================
// Accès aux flux WebRTC (pour CallScreen / CallOverlay)
// ==========================================================
export function getWebRTCStreams(): { local: MediaStream | null; remote: MediaStream | null; remoteStreamId: string | null } {
  if (!webRTCInstance) return { local: null, remote: null, remoteStreamId: null };
  return {
    local: webRTCInstance.getLocalStream(),
    remote: webRTCInstance.getRemoteStream(),
    remoteStreamId: webRTCInstance.getRemoteStreamId(),
  };
}
