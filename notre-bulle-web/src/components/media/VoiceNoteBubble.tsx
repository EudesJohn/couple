// ============================================================
// Bulle de note vocale — design premium avec waveform
// Framer Motion pour l'animation de lecture
//
// TÉLÉCHARGEMENT VIA API SUPABASE (pas getPublicUrl) :
// On utilise downloadMedia() qui passe par l'API client avec
// RLS, ce qui fonctionne même si le bucket n'est pas public.
// ============================================================
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { useVoiceNotes } from '../../hooks/useVoiceNotes';
import { downloadMedia } from '../../lib/media';
import { PlayIcon, PauseIcon } from '../Icons';

interface VoiceNoteBubbleProps {
  storagePath: string;
  durationMs: number;
  isOwn: boolean;
  bubbleSelfColor?: string;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceNoteBubble({ storagePath, durationMs, isOwn, bubbleSelfColor }: VoiceNoteBubbleProps) {
  const {
    playbackState,
    playbackPositionMs,
    playbackDurationMs,
    playUri,
    togglePlayback,
    stopPlayback,
  } = useVoiceNotes();

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const isPlaying = playbackState === 'playing';
  const progress = playbackDurationMs > 0 ? playbackPositionMs / playbackDurationMs : 0;

  // Télécharger l'audio via l'API Supabase (utilise RLS, pas besoin de bucket public)
  useEffect(() => {
    let cancelled = false;

    downloadMedia(storagePath)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setAudioUrl(url);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Erreur téléchargement audio:', err);
        setAudioError(err?.message || 'Impossible de charger le message vocal');
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [storagePath]);

  useEffect(() => {
    return () => { stopPlayback(); };
  }, [stopPlayback]);

  const handlePress = async () => {
    if (!audioUrl) return;
    if (playbackState === 'idle') {
      await playUri(audioUrl);
    } else {
      await togglePlayback();
    }
  };

  const barCount = 24;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const height = 6 + Math.sin(i * 1.1) * 5 + Math.cos(i * 0.6) * 4;
    return Math.max(height, 4);
  });

  const maxBarHeight = Math.max(...bars, 1);

  return (
    <button
      onClick={handlePress}
      disabled={!audioUrl}
      style={{
        display: 'flex',
        alignItems: 'center',
        borderRadius: borderRadius.lg,
        padding: `${spacing.sm}px ${spacing.md}px`,
        gap: spacing.sm,
        minWidth: 200,
        maxWidth: 260,
        border: 'none',
        cursor: audioUrl ? 'pointer' : 'default',
        backgroundColor: isOwn ? (bubbleSelfColor || colors.bubbleSelf) : colors.surfaceAlt,
        borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
        borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        fontFamily: 'inherit',
        opacity: audioUrl ? 1 : 0.6,
      }}
    >
      {/* Play/Pause */}
      <div style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        flexShrink: 0,
      }}>
        {audioError ? (
          <span style={{ fontSize: 14, color: colors.error }}>!</span>
        ) : isPlaying ? (
          <PauseIcon size={14} color={isOwn ? '#FAFAF9' : colors.primary} />
        ) : (
          <PlayIcon size={14} color={isOwn ? '#FAFAF9' : colors.primary} />
        )}
      </div>

      {/* Waveform */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        height: 28,
      }}>
        {bars.map((bar, i) => {
          const isHighlighted = i / barCount <= progress;
          const normalizedHeight = (bar / maxBarHeight) * 22 + 4;
          return (
            <div
              key={i}
              style={{
                width: 3,
                height: normalizedHeight,
                borderRadius: 1.5,
                backgroundColor: isOwn
                  ? isHighlighted ? '#FAFAF9' : 'rgba(255,255,255,0.35)'
                  : isHighlighted ? colors.primary : colors.textTertiary,
                transition: 'background-color 0.15s',
              }}
            />
          );
        })}
      </div>

      {/* Timer */}
      <span style={{
        fontSize: 12, fontWeight: 500,
        minWidth: 32, textAlign: 'right',
        color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textSecondary,
        flexShrink: 0,
      }}>
        {audioError ? 'err' : isPlaying ? formatTime(playbackPositionMs) : formatTime(durationMs)}
      </span>
    </button>
  );
}
