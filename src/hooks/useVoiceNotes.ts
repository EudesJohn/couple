// ============================================================
// Hook — Enregistrement et lecture de notes vocales
// Version sécurisée : utilise expo-av via un wrapper try-catch
// pour éviter les crashes dans Expo Go
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { uploadMedia } from '../lib/media';
import { getAudio } from '../lib/audio';

type RecordingState = 'idle' | 'preparing' | 'recording' | 'stopped';
type PlaybackState = 'idle' | 'playing' | 'paused';

interface VoiceNoteResult {
  uri: string;
  durationMs: number;
  mimeType: string;
}

interface UseVoiceNotesReturn {
  // Enregistrement
  recordingState: RecordingState;
  recordingDurationMs: number;
  isAudioAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<VoiceNoteResult | null>;
  cancelRecording: () => Promise<void>;

  // Lecture
  playbackState: PlaybackState;
  playbackPositionMs: number;
  playbackDurationMs: number;
  playUri: (uri: string) => Promise<void>;
  togglePlayback: () => Promise<void>;
  stopPlayback: () => Promise<void>;

  // Upload
  uploadVoiceNote: (uri: string, durationMs: number) => Promise<{ path: string; url: string } | null>;
}

export function useVoiceNotes(): UseVoiceNotesReturn {
  // État enregistrement
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const recordingRef = useRef<any>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingUriRef = useRef<string | null>(null);

  // État lecture
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0);
  const soundRef = useRef<any>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Récupérer le module audio une fois (sera null si pas dispo)
  const AudioMod = getAudio();

  // ==========================================
  // ENREGISTREMENT
  // ==========================================
  const startRecording = useCallback(async () => {
    const mod = getAudio();
    if (!mod) {
      Alert.alert(
        'Fonctionnalité non disponible',
        'Les notes vocales ne sont pas disponibles dans Expo Go. ' +
        'Utilise un build de développement pour cette fonctionnalité.'
      );
      return;
    }

    try {
      setRecordingState('preparing');

      await mod.Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { recording } = await mod.Audio.Recording.createAsync(
        mod.Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
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
  }, []);

  const stopRecording = useCallback(async (): Promise<VoiceNoteResult | null> => {
    if (!recordingRef.current) return null;
    const mod = getAudio();
    if (!mod) return null;

    try {
      setRecordingState('stopped');

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await mod.Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      if (!uri) return null;

      recordingUriRef.current = uri;
      return {
        uri,
        durationMs: recordingDurationMs,
        mimeType: 'audio/m4a',
      };
    } catch (err) {
      console.error('Erreur arrêt enregistrement:', err);
      return null;
    }
  }, [recordingDurationMs]);

  const cancelRecording = useCallback(async () => {
    const mod = getAudio();

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mod) {
      await mod.Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    }

    setRecordingState('idle');
    setRecordingDurationMs(0);
    recordingUriRef.current = null;
  }, []);

  // ==========================================
  // LECTURE
  // ==========================================
  const startPlaybackTimer = useCallback(async (sound: any) => {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;

    setPlaybackDurationMs(status.durationMillis ?? 0);

    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    playbackTimerRef.current = setInterval(async () => {
      const s = await sound.getStatusAsync();
      if (s.isLoaded) {
        setPlaybackPositionMs(s.positionMillis);
        if (s.didJustFinish) {
          setPlaybackState('idle');
          setPlaybackPositionMs(0);
          if (playbackTimerRef.current) {
            clearInterval(playbackTimerRef.current);
            playbackTimerRef.current = null;
          }
        }
      }
    }, 200);
  }, []);

  const playUri = useCallback(async (uri: string) => {
    const mod = getAudio();
    if (!mod) {
      Alert.alert(
        'Fonctionnalité non disponible',
        'La lecture audio nécessite un build de développement.'
      );
      return;
    }

    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    try {
      await mod.Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound } = await mod.Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      setPlaybackState('playing');
      setPlaybackPositionMs(0);

      await startPlaybackTimer(sound);

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlaybackState('idle');
          setPlaybackPositionMs(0);
          if (playbackTimerRef.current) {
            clearInterval(playbackTimerRef.current);
            playbackTimerRef.current = null;
          }
        }
      });
    } catch (err) {
      console.error('Erreur lecture:', err);
    }
  }, [startPlaybackTimer]);

  const togglePlayback = useCallback(async () => {
    if (!soundRef.current) return;

    try {
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;

      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
        setPlaybackState('paused');
      } else {
        await soundRef.current.playAsync();
        setPlaybackState('playing');
        await startPlaybackTimer(soundRef.current);
      }
    } catch (err) {
      console.error('Erreur toggle lecture:', err);
    }
  }, [startPlaybackTimer]);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }

    setPlaybackState('idle');
    setPlaybackPositionMs(0);
    setPlaybackDurationMs(0);
  }, []);

  // ==========================================
  // UPLOAD
  // ==========================================
  const uploadVoiceNote = useCallback(async (
    uri: string,
    durationMs: number
  ): Promise<{ path: string; url: string } | null> => {
    try {
      const result = await uploadMedia('VOICE_NOTES', uri, 'audio/m4a');
      return { path: result.path, url: result.publicUrl };
    } catch (err) {
      console.error('Erreur upload note vocale:', err);
      return null;
    }
  }, []);

  return {
    recordingState,
    recordingDurationMs,
    isAudioAvailable: getAudio() !== null,
    startRecording,
    stopRecording,
    cancelRecording,

    playbackState,
    playbackPositionMs,
    playbackDurationMs,
    playUri,
    togglePlayback,
    stopPlayback,

    uploadVoiceNote,
  };
}
