// ============================================================
// 🔐 Écran de Verrouillage — PIN + Biométrie + Visage
// Style iOS / iPhone — romantique et épuré
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { colors, typography, spacing } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';

const PIN_LENGTH = 4;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

export default function LockScreen() {
  const { isFirstLaunch, unlockWithPin, unlockWithBiometrics, biometricPrefs, hardwareBiometrics } =
    useAuth();

  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const shakeAnim = useSharedValue(0);
  const dotsAnim = useSharedValue(1);

  // Rediriger si premier lancement
  useEffect(() => {
    if (isFirstLaunch) {
      router.replace('/setup-pin');
    }
  }, [isFirstLaunch]);

  // Shake animation
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeAnim.value }],
  }));

  // Dots animation
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotsAnim.value }],
  }));

  const triggerShake = useCallback(() => {
    setIsError(true);
    shakeAnim.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
    dotsAnim.value = withSequence(
      withSpring(1.3),
      withSpring(1)
    );
    setTimeout(() => setIsError(false), 500);
  }, []);

  // Taper un chiffre
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

      // Vérifier automatiquement à 4 chiffres
      if (newPin.length === PIN_LENGTH) {
        const valid = await unlockWithPin(newPin);
        if (valid) {
          // ✅ Déverrouillé → animation puis redirection
          dotsAnim.value = withSpring(1.5);
          setTimeout(() => router.replace('/chat'), 300);
        } else {
          // ❌ Mauvais PIN
          setAttempts((a) => a + 1);
          triggerShake();
          setTimeout(() => setPin(''), 400);
        }
      }
    },
    [pin, unlockWithPin, attempts]
  );

  // Tentative biométrique automatique
  useEffect(() => {
    const tryBiometric = async () => {
      if (biometricPrefs.fingerprint || biometricPrefs.face) {
        await unlockWithBiometrics();
      }
    };

    // Petit délai pour laisser l'UI se monter
    const timer = setTimeout(tryBiometric, 600);
    return () => clearTimeout(timer);
  }, []);

  // Si premier lancement → on redirige (le layout fait le rendu)
  if (isFirstLaunch) return null;

  const hasFingerprint = hardwareBiometrics.hasHardware && biometricPrefs.fingerprint;
  const hasFace = hardwareBiometrics.hasHardware && biometricPrefs.face;

  return (
    <View style={styles.container}>
      {/* Branding */}
      <View style={styles.branding}>
        <Text style={styles.emoji}>💫</Text>
        <Text style={styles.title}>Notre Bulle</Text>
        <Text style={styles.subtitle}>Déverrouille pour nous rejoindre</Text>
      </View>

      {/* PIN Dots */}
      <Animated.View style={[styles.dotsContainer, shakeStyle]}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              i < pin.length && styles.dotFilled,
              isError && styles.dotError,
              i === pin.length - 1 && i < pin.length && dotStyle,
            ]}
          />
        ))}
      </Animated.View>

      {/* Numpad */}
      <View style={styles.numpad}>
        {NUMPAD_KEYS.map((row, rIdx) => (
          <View key={rIdx} style={styles.numpadRow}>
            {row.map((key) =>
              key === '' ? (
                <View key="empty" style={styles.numpadKeyPlaceholder} />
              ) : (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleKeyPress(key)}
                  activeOpacity={0.6}
                  style={[
                    styles.numpadKey,
                    key === '⌫' && styles.numpadKeySpecial,
                  ]}
                >
                  <Text
                    style={[
                      styles.numpadKeyText,
                      key === '⌫' && styles.numpadKeyTextSpecial,
                    ]}
                  >
                    {key === '⌫' ? '⌫' : key}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        ))}
      </View>

      {/* Biométrie — empreinte + visage */}
      {(hasFingerprint || hasFace) && (
        <View style={styles.biometricRow}>
          {hasFace && (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={() => unlockWithBiometrics()}
            >
              <Text style={styles.biometricIcon}>👤</Text>
              <Text style={styles.biometricLabel}>Visage</Text>
            </TouchableOpacity>
          )}
          {hasFingerprint && (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={() => unlockWithBiometrics()}
            >
              <Text style={styles.biometricIcon}>👆</Text>
              <Text style={styles.biometricLabel}>Empreinte</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tentatives restantes */}
      {attempts > 0 && (
        <Text style={styles.attemptsText}>
          Code incorrect · {3 - Math.min(attempts, 3)} tentative
          {3 - Math.min(attempts, 3) > 1 ? 's' : ''} restante
          {3 - Math.min(attempts, 3) <= 1 ? '' : 's'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Branding
  branding: {
    alignItems: 'center',
    marginBottom: 48,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Dots
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 48,
    height: 24,
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
  },
  dotError: {
    backgroundColor: colors.error,
  },

  // Numpad
  numpad: {
    gap: 16,
    marginBottom: 32,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
  },
  numpadKey: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  numpadKeySpecial: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  numpadKeyPlaceholder: {
    width: 76,
    height: 76,
  },
  numpadKeyText: {
    fontSize: 28,
    fontWeight: '500',
    color: colors.text,
  },
  numpadKeyTextSpecial: {
    fontSize: 24,
    color: colors.textSecondary,
  },

  // Biométrie
  biometricRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 32,
  },
  biometricButton: {
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  biometricIcon: {
    fontSize: 32,
  },
  biometricLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Erreur
  attemptsText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 8,
  },
});
