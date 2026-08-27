// ============================================================
// Hook — Enregistrement et lecture de notes vocales
// Mobile : expo-audio (natif, SDK 57)
// Web : MediaRecorder API + HTMLAudioElement
//
// Migré depuis expo-av (supprimé en SDK 55+).
// ============================================================
import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

type RecordingState = 'idle' | 'preparing' | 'recording' | 'stopped';
type PlaybackState = 'idle' | 'playing' | 'paused';

interface VoiceNoteResult {
  uri: string;
  durationMs: number;
  mimeType: string;
}

interface UseVoiceNotesReturn {
  recordingState: RecordingState;
  recordingDurationMs: number;
  isAudioAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<VoiceNoteResult | null>;
  cancelRecording: () => Promise<void>;

  playbackState: PlaybackState;
  playbackPositionMs: number;
  playbackDurationMs: number;
  playUri: (uri: string) => Promise<void>;
  togglePlayback: () => Promise<void>;
  stopPlayback: () => Promise<void>;
}

const isWeb = Platform.OS === 'web';

export function useVoiceNotes(): UseVoiceNotesReturn {
  // ─── ENREGISTREMENT ───
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingUriRef = useRef<string | null>(null);

  // Mobile : enregistreur expo-audio
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Web: MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  // ─── LECTURE ───
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0);

  // Mobile : lecteur expo-audio (source remplacée dynamiquement)
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  // Web: HTMLAudioElement ref
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const canRecordWeb = isWeb && typeof MediaRecorder !== 'undefined';

  // Synchroniser l'état de lecture avec le lecteur natif
  useEffect(() => {
    if (isWeb) return;
    if (playerStatus.duration > 0) {
      setPlaybackDurationMs(Math.round(playerStatus.duration * 1000));
    }
  }, [playerStatus.duration]);

  useEffect(() => {
    if (isWeb) return;
    setPlaybackPositionMs(Math.round((playerStatus.currentTime || 0) * 1000));
  }, [playerStatus.currentTime]);

  useEffect(() => {
    if (isWeb) return;
    if (playerStatus.didJustFinish) {
      setPlaybackState('idle');
      setPlaybackPositionMs(0);
    }
  }, [playerStatus.didJustFinish]);

  // ==========================================
  // ENREGISTREMENT
  // ==========================================
  const startRecording = useCallback(async () => {
    if (isWeb) {
      // --- WEB : MediaRecorder API ---
      if (!canRecordWeb) {
        Alert.alert(
          'Fonctionnalité non disponible',
          "L'enregistrement vocal nécessite un navigateur récent avec accès au microphone."
        );
        return;
      }

      try {
        setRecordingState('preparing');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaChunksRef.current = [];
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) mediaChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
        };

        recorder.start();
        setRecordingState('recording');
        setRecordingDurationMs(0);

        const startTime = Date.now();
        recordingTimerRef.current = setInterval(() => {
          setRecordingDurationMs(Date.now() - startTime);
        }, 200);
      } catch (err: any) {
        console.error('Erreur enregistrement web:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          Alert.alert('Microphone', "Permission d'accès au microphone refusée.");
        } else {
          Alert.alert('Erreur', "Impossible de lancer l'enregistrement");
        }
        setRecordingState('idle');
      }
      return;
    }

    // --- MOBILE : expo-audio ---
    try {
      setRecordingState('preparing');

      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone', "Permission d'accès au microphone refusée.");
        setRecordingState('idle');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });

      audioRecorder.record();
      setRecordingState('recording');
      setRecordingDurationMs(0);

      const startTime = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingDurationMs(Date.now() - startTime);
      }, 200);
    } catch (err) {
      console.error('Erreur enregistrement:', err);
      Alert.alert('Erreur', "Impossible de lancer l'enregistrement");
      setRecordingState('idle');
    }
  }, [canRecordWeb, audioRecorder]);

  const stopRecording = useCallback(async (): Promise<VoiceNoteResult | null> => {
    if (isWeb) {
      // --- WEB ---
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') return null;

      return new Promise((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm;codecs=opus' });
          const url = URL.createObjectURL(blob);
          recordingUriRef.current = url;
          mediaRecorderRef.current = null;

          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
          }

          setRecordingState('stopped');
          resolve({
            uri: url,
            durationMs: recordingDurationMs,
            mimeType: 'audio/webm',
          });
        };

        recorder.stop();
      });
    }

    // --- MOBILE : expo-audio ---
    if (recordingState !== 'recording') return null;

    try {
      setRecordingState('stopped');
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      await audioRecorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });

      const uri = audioRecorder.uri;
      if (!uri) return null;

      recordingUriRef.current = uri;
      return { uri, durationMs: recordingDurationMs, mimeType: 'audio/m4a' };
    } catch (err) {
      console.error('Erreur arrêt enregistrement:', err);
      return null;
    }
  }, [recordingState, recordingDurationMs, audioRecorder]);

  const cancelRecording = useCallback(async () => {
    if (isWeb) {
      // --- WEB ---
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try { recorder.stop(); } catch {}
        if (recorder.stream) {
          recorder.stream.getTracks().forEach(t => t.stop());
        }
      }
      mediaRecorderRef.current = null;
      mediaChunksRef.current = [];
    } else {
      // --- MOBILE ---
      try { await audioRecorder.stop(); } catch {}
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
      } catch {}
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setRecordingState('idle');
    setRecordingDurationMs(0);
    recordingUriRef.current = null;
  }, [audioRecorder]);

  // ==========================================
  // LECTURE
  // ==========================================
  const stopPlayback = useCallback(async () => {
    if (isWeb) {
      const audio = audioElementRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
        audioElementRef.current = null;
      }
    } else {
      try {
        player.pause();
        await player.seekTo(0);
      } catch {}
    }

    setPlaybackState('idle');
    setPlaybackPositionMs(0);
    setPlaybackDurationMs(0);
  }, [player]);

  const playUri = useCallback(async (uri: string) => {
    if (isWeb) {
      // --- WEB : HTMLAudioElement ---
      try {
        stopPlayback();

        const audio = new Audio(uri);
        audioElementRef.current = audio;

        audio.onloadedmetadata = () => {
          setPlaybackDurationMs(audio.duration * 1000);
          audio.play().then(() => {
            setPlaybackState('playing');
          }).catch(err => {
            console.error('Erreur lecture audio web:', err);
          });
        };

        audio.onended = () => {
          setPlaybackState('idle');
          setPlaybackPositionMs(0);
        };

        audio.onerror = (e) => {
          console.error('Erreur chargement audio web:', e);
        };
      } catch (err) {
        console.error('Erreur lecture:', err);
      }
      return;
    }

    // --- MOBILE : expo-audio ---
    try {
      player.replace({ uri });
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      player.play();
      setPlaybackState('playing');
      setPlaybackPositionMs(0);
    } catch (err) {
      console.error('Erreur lecture:', err);
    }
  }, [player, stopPlayback]);

  const togglePlayback = useCallback(async () => {
    if (isWeb) {
      const audio = audioElementRef.current;
      if (!audio) return;

      if (audio.paused) {
        await audio.play();
        setPlaybackState('playing');
      } else {
        audio.pause();
        setPlaybackState('paused');
      }
      return;
    }

    // Mobile : expo-audio
    try {
      if (player.playing) {
        player.pause();
        setPlaybackState('paused');
      } else {
        player.play();
        setPlaybackState('playing');
      }
    } catch (err) {
      console.error('Erreur toggle lecture:', err);
    }
  }, [player]);

  const isAudioAvailable = isWeb ? canRecordWeb : true; // expo-audio est toujours dispo en natif

  return {
    recordingState,
    recordingDurationMs,
    isAudioAvailable,
    startRecording,
    stopRecording,
    cancelRecording,

    playbackState,
    playbackPositionMs,
    playbackDurationMs,
    playUri,
    togglePlayback,
    stopPlayback,
  };
}
