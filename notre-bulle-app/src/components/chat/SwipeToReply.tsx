// ============================================================
// SwipeToReply — Balayer un message vers la gauche pour répondre
// Comme WhatsApp : swipe → icône Répondre → tap ou relâchement
// Design Burgundy & Gold, animations spring
// ============================================================
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { ReplyIcon } from '../Icons';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';

interface SwipeToReplyProps {
  children: React.ReactNode;
  onReply: () => void;
}

const SWIPE_THRESHOLD = -60; // px — distance de swipe pour déclencher

export function SwipeToReply({ children, onReply }: SwipeToReplyProps) {
  const translateX = useSharedValue(0);
  const revealAmount = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  const gesture = Gesture.Pan()
    .minDistance(10)
    .activeOffsetX(-10) // seulement les swipes vers la gauche
    .failOffsetY([-15, 15]) // annule si trop vertical
    .onUpdate((e) => {
      // Limiter l'étendue du swipe
      const limited = Math.max(e.translationX, -120);
      translateX.value = limited;
      revealAmount.value = Math.min(Math.abs(limited) / 100, 1);
      buttonOpacity.value = Math.min(Math.abs(limited) / 80, 1);
    })
    .onEnd(() => {
      if (translateX.value < SWIPE_THRESHOLD) {
        // Déclencher la réponse
        runOnJS(onReply)();
      }
      // Revenir en position
      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      revealAmount.value = withTiming(0, { duration: 200 });
      buttonOpacity.value = withTiming(0, { duration: 150 });
    })
    .onFinalize(() => {
      // Sécurité : revenir si le geste est interrompu
      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      revealAmount.value = withTiming(0, { duration: 200 });
      buttonOpacity.value = withTiming(0, { duration: 150 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyBtnStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: Math.max(0.3, Math.min(1, revealAmount.value)) }],
  }));

  return (
    <View style={styles.container}>
      {/* Bouton Répondre révélé derrière */}
      <Animated.View style={[styles.replyButton, replyBtnStyle]}>
        <ReplyIcon size={18} color={colors.primary} />
        <Text style={styles.replyLabel}>Répondre</Text>
      </Animated.View>

      {/* Message avec gestionnaire de geste */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={animatedStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
  },
  replyButton: {
    position: 'absolute',
    left: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    width: 48,
  },
  replyLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
});
