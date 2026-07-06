// ============================================================
// Hook — Enregistrement et lecture de notes vocales
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Alert } from 'react-native';
import { uploadMedia } from '../lib/media';

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
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingUriRef = useRef<string | null>(null);

  // État lecture
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ==========================================
  // ENREGISTREMENT
  // ==========================================
  const startRecording = useCallback(async () => {
    try {
      setRecordingState('preparing');

      // Configurer l'audio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setRecordingState('recording');
      setRecordingDurationMs(0);

      // Timer pour la durée
      const startTime = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingDurationMs(Date.now() - startTime);
      }, 200);
    } catch (err) {
      console.error('Erreur enregistrement:', err);
      Alert.alert('Erreur', 'Impossible de lancer l\'enregistrement');
      setRecordingState('idle');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<VoiceNoteResult | null> => {
    if (!recordingRef.current) return null;

    try {
      setRecordingState('stopped');

      // Arrêter le timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      // Arrêter l'enregistrement
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Restaurer le mode audio (plus d'enregistrement)
      await Audio.setAudioModeAsync({
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

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    setRecordingState('idle');
    setRecordingDurationMs(0);
    recordingUriRef.current = null;
  }, []);

  // ==========================================
  // LECTURE
  // ==========================================
  const startPlaybackTimer = useCallback(async (sound: Audio.Sound) => {
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
    // Libérer le son précédent
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      setPlaybackState('playing');
      setPlaybackPositionMs(0);

      await startPlaybackTimer(sound);

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
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
