// ============================================================
// Interface d'enregistrement vocal — overlay au-dessus du chat
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';

interface VoiceRecorderProps {
  durationMs: number;
  isRecording: boolean;
  onStop: () => void;
  onCancel: () => void;
  onSend: () => void;
}

// ==========================================
// COMPOSANTS INTERNES (externalisés)
// ==========================================

function RecordDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.2, { duration: 600 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.recordDot, animatedStyle]} />;
}

function AmplitudeBar({ height: barHeight }: { height: number }) {
  const anim = useSharedValue(barHeight);

  useEffect(() => {
    anim.value = withRepeat(
      withTiming(0.2 + Math.random() * 0.8, { duration: 300 + Math.random() * 400 }),
      -1,
      true
    );
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    height: 16 + anim.value * 28,
  }));

  return <Animated.View style={[styles.amplitudeBar, barStyle]} />;
}

const AMPLITUDE_HEIGHTS = [0.3, 0.5, 0.7, 1.0, 0.8, 0.6, 0.4, 0.7, 0.9, 0.5];

function AmplitudeBars() {
  return (
    <View style={styles.amplitudeContainer}>
      {AMPLITUDE_HEIGHTS.map((h, i) => (
        <AmplitudeBar key={i} height={h} />
      ))}
    </View>
  );
}

// ==========================================
// MAIN COMPOSANT
// ==========================================

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({
  durationMs,
  isRecording,
  onStop,
  onCancel,
  onSend,
}: VoiceRecorderProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      {/* Annuler */}
      <TouchableOpacity onPress={onCancel} style={styles.actionButton}>
        <Text style={styles.cancelText}>Annuler</Text>
      </TouchableOpacity>

      {/* Visualisation + Timer */}
      <View style={styles.centerSection}>
        <View style={styles.recordingLabel}>
          <RecordDot />
          <Text style={styles.recLabel}>
            {isRecording ? 'ENREGISTREMENT' : 'TERMINÉ'}
          </Text>
        </View>

        <AmplitudeBars />

        <Text style={styles.timer}>{formatTime(durationMs)}</Text>
      </View>

      {/* Stop / Send */}
      {isRecording ? (
        <TouchableOpacity onPress={onStop} style={styles.stopButton}>
          <View style={styles.stopIcon} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onSend} style={styles.sendButton}>
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  recordingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.callRed,
  },
  recLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.callRed,
    letterSpacing: 1,
  },
  amplitudeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 40,
  },
  amplitudeBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
  },
  timer: {
    ...typography.subheading,
    fontSize: 18,
    color: colors.text,
  },
  stopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.callRed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIcon: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: {
    fontSize: 20,
    color: '#fff',
  },
});
