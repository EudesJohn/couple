// ============================================================
// Hook — Enregistrement et lecture de notes vocales
// Mobile : expo-av (natif)
// Web : MediaRecorder API + HTMLAudioElement
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { getAudio, isMediaRecorderAvailable } from '../lib/audio';

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
  // État enregistrement
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingUriRef = useRef<string | null>(null);

  // Web: MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  // Mobile: expo-av recording ref
  const expoRecordingRef = useRef<any>(null);

  // État lecture
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mobile: expo-av sound ref
  const soundRef = useRef<any>(null);
  // Web: HTMLAudioElement ref
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const AudioMod = !isWeb ? getAudio() : null;
  const canRecordWeb = isWeb && isMediaRecorderAvailable();

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
          // Arrêter le stream
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
          Alert.alert('Microphone', 'Permission d\'accès au microphone refusée.');
        } else {
          Alert.alert('Erreur', "Impossible de lancer l'enregistrement");
        }
        setRecordingState('idle');
      }
      return;
    }

    // --- MOBILE : expo-av ---
    const mod = getAudio();
    if (!mod) {
      Alert.alert(
        'Fonctionnalité non disponible',
        'Les notes vocales ne sont pas disponibles dans Expo Go. Utilise un build de développement.'
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

      expoRecordingRef.current = recording;
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
  }, [canRecordWeb]);

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

    // --- MOBILE : expo-av ---
    if (!expoRecordingRef.current) return null;
    const mod = getAudio();
    if (!mod) return null;

    try {
      setRecordingState('stopped');
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      await expoRecordingRef.current.stopAndUnloadAsync();
      const uri = expoRecordingRef.current.getURI();
      expoRecordingRef.current = null;

      await mod.Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      if (!uri) return null;

      recordingUriRef.current = uri;
      return { uri, durationMs: recordingDurationMs, mimeType: 'audio/m4a' };
    } catch (err) {
      console.error('Erreur arrêt enregistrement:', err);
      return null;
    }
  }, [recordingDurationMs]);

  const cancelRecording = useCallback(async () => {
    if (isWeb) {
      // --- WEB ---
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try { recorder.stop(); } catch {}
        // Libérer le stream
        if (recorder.stream) {
          recorder.stream.getTracks().forEach(t => t.stop());
        }
      }
      mediaRecorderRef.current = null;
      mediaChunksRef.current = [];
    } else {
      // --- MOBILE ---
      const mod = getAudio();
      if (expoRecordingRef.current) {
        try {
          await expoRecordingRef.current.stopAndUnloadAsync();
        } catch {}
        expoRecordingRef.current = null;
      }
      if (mod) {
        await mod.Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      }
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setRecordingState('idle');
    setRecordingDurationMs(0);
    recordingUriRef.current = null;
  }, []);

  // ==========================================
  // LECTURE
  // ==========================================
  const clearPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const startPlaybackTimer = useCallback((duration: number) => {
    clearPlaybackTimer();
    setPlaybackPositionMs(0);
    playbackTimerRef.current = setInterval(() => {
      setPlaybackPositionMs(prev => {
        if (prev >= duration) {
          clearPlaybackTimer();
          setPlaybackState('idle');
          return 0;
        }
        return prev + 200;
      });
    }, 200);
  }, [clearPlaybackTimer]);

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
            startPlaybackTimer(audio.duration * 1000);
          }).catch(err => {
            console.error('Erreur lecture audio web:', err);
          });
        };

        audio.onended = () => {
          setPlaybackState('idle');
          setPlaybackPositionMs(0);
          clearPlaybackTimer();
        };

        audio.onerror = (e) => {
          console.error('Erreur chargement audio web:', e);
        };
      } catch (err) {
        console.error('Erreur lecture:', err);
      }
      return;
    }

    // --- MOBILE : expo-av ---
    const mod = getAudio();
    if (!mod) {
      Alert.alert(
        'Fonctionnalité non disponible',
        'La lecture audio nécessite un build de développement.'
      );
      return;
    }

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

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

      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        setPlaybackDurationMs(status.durationMillis);
        startPlaybackTimer(status.durationMillis);
      }

      sound.setOnPlaybackStatusUpdate((s: any) => {
        if (s.isLoaded && s.didJustFinish) {
          setPlaybackState('idle');
          setPlaybackPositionMs(0);
          clearPlaybackTimer();
        }
      });
    } catch (err) {
      console.error('Erreur lecture:', err);
    }
  }, [startPlaybackTimer, clearPlaybackTimer, stopPlayback]);

  const togglePlayback = useCallback(async () => {
    if (isWeb) {
      const audio = audioElementRef.current;
      if (!audio) return;

      if (audio.paused) {
        await audio.play();
        setPlaybackState('playing');
        if (playbackDurationMs > 0) startPlaybackTimer(playbackDurationMs);
      } else {
        audio.pause();
        setPlaybackState('paused');
        clearPlaybackTimer();
      }
      return;
    }

    // Mobile
    if (!soundRef.current) return;
    try {
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;

      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
        setPlaybackState('paused');
        clearPlaybackTimer();
      } else {
        await soundRef.current.playAsync();
        setPlaybackState('playing');
        if (playbackDurationMs > 0) startPlaybackTimer(playbackDurationMs);
      }
    } catch (err) {
      console.error('Erreur toggle lecture:', err);
    }
  }, [playbackDurationMs, startPlaybackTimer, clearPlaybackTimer]);

  const stopPlayback = useCallback(async () => {
    if (isWeb) {
      const audio = audioElementRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
        audioElementRef.current = null;
      }
    } else {
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch {}
        soundRef.current = null;
      }
    }

    clearPlaybackTimer();
    setPlaybackState('idle');
    setPlaybackPositionMs(0);
    setPlaybackDurationMs(0);
  }, [clearPlaybackTimer]);

  const isAudioAvailable = isWeb ? canRecordWeb : getAudio() !== null;

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
