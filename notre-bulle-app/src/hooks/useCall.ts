// ============================================================
// Hook — Appels audio/vidéo (wrapper sur le store global)
//
// L'état est PARTAGÉ par toute l'app via callStore (singleton) :
// header, écran d'appel, bannière entrant et notifications voient
// tous le même état. (Avant : chaque useCall() avait son état
// isolé — l'écran d'appel ne pouvait pas raccrocher.)
// ============================================================
import { useEffect, useSyncExternalStore } from 'react';
import { callStore } from '../lib/callStore';
import type { CallStoreState } from '../lib/callStore';

export type CallStateType = CallStoreState['callState'];

export interface UseCallReturn extends CallStoreState {
  startCall: (type: 'audio' | 'video') => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleSpeakerFn: () => Promise<void>;
  switchCamera: () => Promise<boolean>;
  resetCall: () => void;
}

export function useCall(): UseCallReturn {
  // Initialiser le store une fois (profils + canal Realtime)
  useEffect(() => {
    callStore.ensureInit();
  }, []);

  const state = useSyncExternalStore(
    callStore.subscribe,
    callStore.getState,
    callStore.getState
  );

  return {
    ...state,
    startCall: callStore.startCall,
    answerCall: callStore.answerCall,
    rejectCall: callStore.rejectCall,
    endCall: callStore.endCall,
    toggleMute: callStore.toggleMute,
    toggleSpeakerFn: callStore.toggleSpeakerFn,
    switchCamera: callStore.switchCamera,
    resetCall: callStore.resetCall,
  };
}
