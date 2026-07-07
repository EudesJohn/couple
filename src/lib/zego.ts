// ============================================================
// ZegoCloud — Moteur audio/vidéo pour les appels
// Chargement dynamique : ne crash PAS dans Expo Go
// ============================================================

import { config } from '../constants/config';

// Constantes Zego (définies localement, pas besoin du natif)
export const ZegoViewMode = {
  AspectFill: 0,
  AspectFit: 1,
} as const;

let engine: any = null;
let previewView: any = undefined;
let remoteView: any = undefined;
let onRemoteStreamUpdate: ((streams: any[], added: boolean) => void) | null = null;

// Module natif mis en cache après chargement
let ZegoModule: any = null;

interface CallUser {
  userID: string;
  userName: string;
}

export type ZegoStream = any;

// Charge le module natif Zego UNIQUEMENT quand on en a besoin
async function getZegoModule() {
  if (ZegoModule) return ZegoModule;
  try {
    ZegoModule = await import('zego-express-engine-reactnative');
    return ZegoModule;
  } catch {
    console.warn('[Zego] Module natif non disponible (Expo Go)');
    return null;
  }
}

// Initialiser le moteur (une seule fois)
export async function getEngine(): Promise<any> {
  if (engine) return engine;

  const Zego = await getZegoModule();
  if (!Zego) {
    throw new Error('[Zego] Module non disponible sur cette plateforme');
  }

  engine = await Zego.default.createEngineWithProfile({
    appID: config.zego.appID,
    appSign: config.zego.appSign,
    scenario: Zego.ZegoScenario.StandardVideoCall,
  });

  // Écouter les événements de flux distants
  engine.on('roomStreamUpdate', (roomID: string, updateType: number, streamList: any[]) => {
    const added = updateType === 0; // ZegoUpdateType.Add = 0
    onRemoteStreamUpdate?.(streamList, added);
  });

  return engine;
}

// Vérifier si Zego est disponible (sans lancer d'erreur)
export async function isZegoAvailable(): Promise<boolean> {
  try {
    const Zego = await getZegoModule();
    return Zego !== null;
  } catch {
    return false;
  }
}

// Enregistrer les vues natives
export function setPreviewView(view: any | undefined): void {
  previewView = view;
}

export function setRemoteView(view: any | undefined): void {
  remoteView = view;
}

// Callback pour les flux distants
export function setOnRemoteStreamUpdate(
  cb: ((streams: any[], added: boolean) => void) | null
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
    const Zego = ZegoModule;
    await Zego?.default?.destroyEngine?.();
    engine = null;
    previewView = undefined;
    remoteView = undefined;
    ZegoModule = null;
  }
}
