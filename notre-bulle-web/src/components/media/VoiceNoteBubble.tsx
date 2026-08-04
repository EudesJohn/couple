// ============================================================
// Bulle de note vocale — design premium avec waveform
// Framer Motion pour l'animation de lecture
//
// TÉLÉCHARGEMENT VIA API SUPABASE (pas getPublicUrl) :
// On utilise downloadMedia() qui passe par l'API client avec
// RLS, ce qui fonctionne même si le bucket n'est pas public.
//
// Verrouillage WhatsApp : si requireDownload est vrai, la note
// vocale reste derrière un bouton "Télécharger" jusqu'au tap.
// ============================================================
import { useEffect } from 'react';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { useVoiceNotes } from '../../hooks/useVoiceNotes';
import { useDownloadGate } from '../../hooks/useDownloadGate';
import { DownloadPlaceholder } from './DownloadPlaceholder';
import { PlayIcon, PauseIcon } from '../Icons';

interface VoiceNoteBubbleProps {
  storagePath: string;
  durationMs: number;
  isOwn: boolean;
  bubbleSelfColor?: string;
  /** Bloque la lecture derrière un bouton Télécharger (style WhatsApp) */
  requireDownload?: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceNoteBubble({ storagePath, durationMs, isOwn, bubbleSelfColor, requireDownload }: VoiceNoteBubbleProps) {
  const {
    playbackState,
    playbackPositionMs,
    playbackDurationMs,
    playUri,
    togglePlayback,
    stopPlayback,
  } = useVoiceNotes();

  const { blobUrl: audioUrl, downloading, error: downloadError, startDownload } =
    useDownloadGate(storagePath, !!requireDownload);

  const isPlaying = playbackState === 'playing';
  const progress = playbackDurationMs > 0 ? playbackPositionMs / playbackDurationMs : 0;

  useEffect(() => {
    return () => { stopPlayback(); };
  }, [stopPlayback]);

  // Verrouillé : bouton de téléchargement (style WhatsApp)
  if (!audioUrl) {
    return (
      <DownloadPlaceholder
        label="Télécharger"
        downloading={downloading}
        error={downloadError}
        width="100%"
        height={56}
        onDownload={startDownload}
        borderRadiusValue={borderRadius.lg}
        style={{ minWidth: 200, maxWidth: 260 }}
      />
    );
  }

  const handlePress = async () => {
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
      style={{
        display: 'flex',
        alignItems: 'center',
        borderRadius: borderRadius.lg,
        padding: `${spacing.sm}px ${spacing.md}px`,
        gap: spacing.sm,
        minWidth: 200,
        maxWidth: 260,
        border: 'none',
        cursor: 'pointer',
        backgroundColor: isOwn ? (bubbleSelfColor || colors.bubbleSelf) : colors.surfaceAlt,
        borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
        borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        fontFamily: 'inherit',
      }}
    >
      {/* Play/Pause */}
      <div style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        flexShrink: 0,
      }}>
        {isPlaying ? (
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
        {isPlaying ? formatTime(playbackPositionMs) : formatTime(durationMs)}
      </span>
    </button>
  );
}
