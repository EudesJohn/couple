// ============================================================
// ZegoCloud — Moteur audio/vidéo pour les appels
// API v3.22.0
// ============================================================
import ZegoExpressEngine, { ZegoScenario, ZegoViewMode } from 'zego-express-engine-reactnative';
import type { ZegoView, ZegoStream } from 'zego-express-engine-reactnative';
import { config } from '../constants/config';

let engine: ZegoExpressEngine | null = null;
let previewView: ZegoView | undefined;
let remoteView: ZegoView | undefined;

// Callbacks externes
let onRemoteStreamUpdate: ((streams: ZegoStream[], added: boolean) => void) | null = null;

interface CallUser {
  userID: string;
  userName: string;
}

export type { ZegoStream };
export { ZegoViewMode };

// Initialiser le moteur (une seule fois)
export async function getEngine(): Promise<ZegoExpressEngine> {
  if (!engine) {
    engine = await ZegoExpressEngine.createEngineWithProfile({
      appID: config.zego.appID,
      appSign: config.zego.appSign,
      scenario: ZegoScenario.StandardVideoCall,
    });

    // Écouter les événements de flux distants
    engine.on('roomStreamUpdate', (roomID: string, updateType: number, streamList: ZegoStream[]) => {
      const added = updateType === 0; // ZegoUpdateType.Add = 0
      onRemoteStreamUpdate?.(streamList, added);
    });
  }
  return engine;
}

// Enregistrer les vues natives
export function setPreviewView(view: ZegoView | undefined): void {
  previewView = view;
}

export function setRemoteView(view: ZegoView | undefined): void {
  remoteView = view;
}

// Callback pour les flux distants
export function setOnRemoteStreamUpdate(
  cb: ((streams: ZegoStream[], added: boolean) => void) | null
): void {
  onRemoteStreamUpdate = cb;
}

// Rejoindre un salon
export async function joinRoom(roomID: string, user: CallUser): Promise<void> {
  const zg = await getEngine();
  const result = await zg.loginRoom(
    roomID,
    { userID: user.userID, userName: user.userName },
    {
      maxMemberCount: 2,
      isUserStatusNotify: true,
      token: '',
    }
  );
  if (result.errorCode !== 0) {
    throw new Error(`Échec de connexion au salon: code ${result.errorCode}`);
  }
}

// Quitter un salon
export async function leaveRoom(roomID?: string): Promise<void> {
  const zg = await getEngine();
  await zg.logoutRoom(roomID);
}

// Publier son flux
export async function startPublish(): Promise<void> {
  const zg = await getEngine();
  if (previewView) {
    await zg.startPreview(previewView, undefined);
  }
  await zg.startPublishingStream('stream_main', undefined, undefined);
}

// Arrêter la publication
export async function stopPublish(): Promise<void> {
  const zg = await getEngine();
  await zg.stopPublishingStream(undefined);
  await zg.stopPreview(undefined);
}

// Lire le flux distant
export async function startPlayingStream(streamID: string): Promise<void> {
  const zg = await getEngine();
  await zg.startPlayingStream(streamID, remoteView, undefined);
}

export async function stopPlayingStream(streamID: string): Promise<void> {
  const zg = await getEngine();
  await zg.stopPlayingStream(streamID);
}

// Contrôles audio
export async function toggleSpeaker(enabled: boolean): Promise<void> {
  const zg = await getEngine();
  await zg.muteSpeaker(!enabled);
}

export async function muteMicrophone(muted: boolean): Promise<void> {
  const zg = await getEngine();
  await zg.muteMicrophone(muted);
}

// Détruire le moteur
export async function destroy(): Promise<void> {
  if (engine) {
    onRemoteStreamUpdate = null;
    await ZegoExpressEngine.destroyEngine();
    engine = null;
    previewView = undefined;
    remoteView = undefined;
  }
}
