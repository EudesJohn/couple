// ============================================================
// Bulle de note vocale — lecture / pause / timer / barre
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';
import { useVoiceNotes } from '../../hooks/useVoiceNotes';
import { getMediaUrl } from '../../lib/media';

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

export function VoiceNoteBubble({ storagePath, durationMs, isOwn }: VoiceNoteBubbleProps) {
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

  // Nettoyer à la sortie
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

  // Animation de la barre de son
  const barCount = 20;
  const bars = Array.from({ length: barCount }, (_, i) => ({
    height: 8 + Math.sin(i * 1.2) * 6 + Math.cos(i * 0.7) * 4,
  }));

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[
        styles.container,
        {
          backgroundColor: isOwn ? colors.bubbleSelf : colors.bubbleOther,
          borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
          borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        },
      ]}
      activeOpacity={0.7}
    >
      {/* Bouton play/pause */}
      <View style={styles.playButton}>
        <Text style={[styles.playIcon, { color: isOwn ? '#fff' : colors.text }]}>
          {isPlaying ? '⏸' : '▶️'}
        </Text>
      </View>

      {/* Barre de progression visuelle */}
      <View style={styles.waveform}>
        {bars.map((bar, i) => {
          const isHighlighted = i / barCount <= progress;
          return (
            <View
              key={i}
              style={{
                width: 3,
                height: bar.height,
                borderRadius: 1.5,
                backgroundColor: isOwn
                  ? isHighlighted ? '#fff' : 'rgba(255,255,255,0.4)'
                  : isHighlighted ? colors.text : colors.textTertiary,
              }}
            />
          );
        })}
      </View>

      {/* Timer */}
      <Text
        style={[
          styles.timer,
          { color: isOwn ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
        ]}
      >
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
    minWidth: 180,
    maxWidth: 260,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 16,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
  },
  timer: {
    fontSize: 12,
    minWidth: 32,
    textAlign: 'right',
  },
});
