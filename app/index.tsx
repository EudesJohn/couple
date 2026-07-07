// ============================================================
// 🔐 Écran de Verrouillage — Design Premium Burgundy & Gold
// Animations fluides, pas d'emojis, boutons stylisés
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
  useSharedValue,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';
import { LockIcon, HeartFilledIcon } from '../src/components/Icons';

const PIN_LENGTH = 4;
const { width } = Dimensions.get('window');
const KEY_SIZE = (width - 64 - 40) / 3;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

export default function LockScreen() {
  const { isFirstLaunch, unlockWithPin, unlockWithBiometrics, biometricPrefs, hardwareBiometrics } = useAuth();

  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const shakeAnim = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);

  // Animation de glow pulsante
  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1500 }),
        withTiming(0.3, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);

  // Rediriger si premier lancement
  useEffect(() => {
    if (isFirstLaunch) {
      router.replace('/setup-pin');
    }
  }, [isFirstLaunch]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeAnim.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const triggerShake = useCallback(() => {
    setIsError(true);
    shakeAnim.value = withSequence(
      withTiming(-12, { duration: 40 }),
      withTiming(12, { duration: 40 }),
      withTiming(-12, { duration: 40 }),
      withTiming(12, { duration: 40 }),
      withTiming(0, { duration: 40 })
    );
    setTimeout(() => setIsError(false), 500);
  }, []);

  const handleKeyPress = useCallback(
    async (key: string) => {
      if (key === '⌫') {
        setPin((prev) => prev.slice(0, -1));
        setIsError(false);
        return;
      }

      if (key === '' || pin.length >= PIN_LENGTH) return;

      const newPin = pin + key;
      setPin(newPin);

      if (newPin.length === PIN_LENGTH) {
        const valid = await unlockWithPin(newPin);
        if (valid) {
          setTimeout(() => router.replace('/chat'), 350);
        } else {
          setAttempts((a) => a + 1);
          triggerShake();
          setTimeout(() => setPin(''), 400);
        }
      }
    },
    [pin, unlockWithPin]
  );

  useEffect(() => {
    const tryBiometric = async () => {
      if (biometricPrefs.fingerprint || biometricPrefs.face) {
        await unlockWithBiometrics();
      }
    };
    const timer = setTimeout(tryBiometric, 600);
    return () => clearTimeout(timer);
  }, []);

  if (isFirstLaunch) return null;

  const hasBiometrics = hardwareBiometrics.hasHardware && (biometricPrefs.fingerprint || biometricPrefs.face);

  return (
    <View style={styles.container}>
      {/* Fond décoratif */}
      <View style={styles.decorativeTop}>
        <View style={styles.glowCircle} />
      </View>

      {/* Logo / Branding */}
      <Animated.View entering={FadeInDown.duration(800).springify()} style={styles.branding}>
        <View style={styles.logoContainer}>
          <Animated.View style={[styles.glowRing, glowStyle]} />
          <HeartFilledIcon size={48} color={colors.accent} />
        </View>
        <Text style={styles.title}>Notre Bulle</Text>
        <Text style={styles.subtitle}>Déverrouille pour nous rejoindre</Text>
      </Animated.View>

      {/* PIN Dots */}
      <Animated.View entering={FadeIn.duration(600).delay(200)} style={[styles.dotsContainer, shakeStyle]}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < pin.length && styles.dotFilled,
              isError && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>

      {/* Numpad */}
      <Animated.View entering={FadeInDown.duration(600).delay(400)} style={styles.numpad}>
        {NUMPAD_KEYS.map((row, rIdx) => (
          <View key={rIdx} style={styles.numpadRow}>
            {row.map((key) =>
              key === '' ? (
                <View key="empty" style={styles.keyPlaceholder} />
              ) : (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleKeyPress(key)}
                  activeOpacity={0.7}
                  style={[
                    styles.numKey,
                    key === '⌫' && styles.numKeySpecial,
                  ]}
                >
                  <Text
                    style={[
                      styles.numKeyText,
                      key === '⌫' && styles.numKeyTextSpecial,
                    ]}
                  >
                    {key === '⌫' ? '⌫' : key}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        ))}
      </Animated.View>

      {/* Biométrie */}
      {hasBiometrics && (
        <Animated.View entering={FadeIn.duration(600).delay(600)} style={styles.biometricContainer}>
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={() => unlockWithBiometrics()}
            activeOpacity={0.7}
          >
            <LockIcon size={22} color={colors.primary} />
            <Text style={styles.biometricText}>Déverrouillage biométrique</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Tentatives */}
      {attempts > 0 && (
        <Text style={styles.attemptsText}>
          Code incorrect · {3 - Math.min(attempts, 3)} tentative{3 - Math.min(attempts, 3) > 1 ? 's' : ''} restante{3 - Math.min(attempts, 3) <= 1 ? '' : 's'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  decorativeTop: {
    position: 'absolute',
    top: -120,
    left: -120,
    right: -120,
    height: 300,
    overflow: 'hidden',
  },
  glowCircle: {
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: colors.glowBurgundy,
    alignSelf: 'center',
    opacity: 0.5,
  },
  branding: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: colors.shadowStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  glowRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: colors.accent,
    opacity: 0.3,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 44,
    height: 16,
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.border,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    shadowColor: colors.glowBurgundy,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  dotError: {
    backgroundColor: colors.error,
  },
  numpad: {
    gap: 14,
    marginBottom: 32,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
  },
  numKey: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  numKeySpecial: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  keyPlaceholder: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  numKeyText: {
    fontSize: 28,
    fontWeight: '500',
    color: colors.text,
  },
  numKeyTextSpecial: {
    fontSize: 22,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  biometricContainer: {
    alignItems: 'center',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  biometricText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '500',
  },
  attemptsText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.lg,
  },
});
