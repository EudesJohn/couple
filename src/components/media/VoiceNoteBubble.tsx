// ============================================================
// Bulle de note vocale — design premium avec waveform
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';
import { useVoiceNotes } from '../../hooks/useVoiceNotes';
import { getMediaUrl } from '../../lib/media';
import { PlayIcon, PauseIcon, WaveformIcon } from '../Icons';

interface VoiceNoteBubbleProps {
  storagePath: string;
  durationMs: number;
  isOwn: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceNoteBubble({ storagePath, durationMs, isOwn, bubbleSelfColor }: VoiceNoteBubbleProps & { bubbleSelfColor?: string }) {
  const {
    playbackState,
    playbackPositionMs,
    playbackDurationMs,
    playUri,
    togglePlayback,
    stopPlayback,
  } = useVoiceNotes();

  const audioUrl = getMediaUrl(storagePath);
  const isPlaying = playbackState === 'playing';
  const progress = playbackDurationMs > 0 ? playbackPositionMs / playbackDurationMs : 0;

  useEffect(() => {
    return () => { stopPlayback(); };
  }, []);

  const handlePress = async () => {
    if (playbackState === 'idle') {
      await playUri(audioUrl);
    } else {
      await togglePlayback();
    }
  };

  // Barres waveform
  const barCount = 24;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const height = 6 + Math.sin(i * 1.1) * 5 + Math.cos(i * 0.6) * 4;
    return Math.max(height, 4);
  });

  const maxBarHeight = Math.max(...bars, 1);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[
        styles.container,
        {
          backgroundColor: isOwn ? (bubbleSelfColor || colors.bubbleSelf) : colors.surfaceAlt,
          borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
          borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        },
      ]}
    >
      {/* Play/Pause */}
      <View style={styles.playButton}>
        {isPlaying ? (
          <PauseIcon size={14} color={isOwn ? '#FAFAF9' : colors.primary} />
        ) : (
          <PlayIcon size={14} color={isOwn ? '#FAFAF9' : colors.primary} />
        )}
      </View>

      {/* Waveform */}
      <View style={styles.waveform}>
        {bars.map((bar, i) => {
          const isHighlighted = i / barCount <= progress;
          const normalizedHeight = (bar / maxBarHeight) * 22 + 4;
          return (
            <View
              key={i}
              style={{
                width: 3,
                height: normalizedHeight,
                borderRadius: 1.5,
                backgroundColor: isOwn
                  ? isHighlighted ? '#FAFAF9' : 'rgba(255,255,255,0.35)'
                  : isHighlighted ? colors.primary : colors.textTertiary,
              }}
            />
          );
        })}
      </View>

      {/* Timer */}
      <Text style={[styles.timer, { color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
        {isPlaying ? formatTime(playbackPositionMs) : formatTime(durationMs)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    minWidth: 200,
    maxWidth: 260,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 28,
  },
  timer: {
    fontSize: 12,
    fontWeight: '500',
    minWidth: 32,
    textAlign: 'right',
  },
});
