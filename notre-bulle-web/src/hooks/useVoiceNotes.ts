// ============================================================
// Hook — Enregistrement et lecture de notes vocales (Web)
// MediaRecorder API + HTMLAudioElement
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { isMediaRecorderAvailable } from '../lib/audio';

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

export function useVoiceNotes(): UseVoiceNotesReturn {
  // État enregistrement
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingUriRef = useRef<string | null>(null);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  // État lecture
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // HTMLAudioElement ref
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const canRecord = isMediaRecorderAvailable();

  // ==========================================
  // ENREGISTREMENT
  // ==========================================
  const startRecording = useCallback(async () => {
    if (!canRecord) {
      console.warn("L'enregistrement vocal nécessite un navigateur récent avec accès au microphone.");
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
      console.error('Erreur enregistrement:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        console.warn('Permission d\'accès au microphone refusée.');
      }
      setRecordingState('idle');
    }
  }, [canRecord]);

  const stopRecording = useCallback(async (): Promise<VoiceNoteResult | null> => {
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
  }, [recordingDurationMs]);

  const cancelRecording = useCallback(async () => {
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

  const stopPlayback = useCallback(async () => {
    const audio = audioElementRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audioElementRef.current = null;
    }

    clearPlaybackTimer();
    setPlaybackState('idle');
    setPlaybackPositionMs(0);
    setPlaybackDurationMs(0);
  }, [clearPlaybackTimer]);

  const playUri = useCallback(async (uri: string) => {
    try {
      await stopPlayback();

      const audio = new Audio(uri);
      audioElementRef.current = audio;

      audio.onloadedmetadata = () => {
        setPlaybackDurationMs(audio.duration * 1000);
        audio.play().then(() => {
          setPlaybackState('playing');
          startPlaybackTimer(audio.duration * 1000);
        }).catch(err => {
          console.error('Erreur lecture audio:', err);
        });
      };

      audio.onended = () => {
        setPlaybackState('idle');
        setPlaybackPositionMs(0);
        clearPlaybackTimer();
      };

      audio.onerror = (e) => {
        console.error('Erreur chargement audio:', e);
      };
    } catch (err) {
      console.error('Erreur lecture:', err);
    }
  }, [startPlaybackTimer, clearPlaybackTimer, stopPlayback]);

  const togglePlayback = useCallback(async () => {
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
  }, [playbackDurationMs, startPlaybackTimer, clearPlaybackTimer]);

  const isAudioAvailable = canRecord;

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
