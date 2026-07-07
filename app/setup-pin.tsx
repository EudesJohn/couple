// ============================================================
// 🔐 Configuration initiale — PIN + Biométrie
// Design Premium Burgundy & Gold
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSequence,
  withTiming,
  useSharedValue,
  withSpring,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius } from '../src/constants/theme';
import {
  hashPin, savePinHash, saveBiometricPrefs,
  getHardwareBiometrics, markSetupDone,
} from '../src/lib/auth';
import { useAuth } from '../src/hooks/useAuth';
import { CheckIcon, LockIcon, UserIcon, HeartIcon } from '../src/components/Icons';

const PIN_LENGTH = 4;
const { width } = Dimensions.get('window');
const KEY_SIZE = (width - 64 - 40) / 3;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

type SetupStep = 'create' | 'confirm' | 'biometric' | 'done';

const STEP_TITLES: Record<SetupStep, { title: string; subtitle: string; icon: React.ReactNode }> = {
  create: {
    title: 'Crée ton code secret',
    subtitle: 'Choisis un code à 4 chiffres',
    icon: <LockIcon size={24} color={colors.accent} />,
  },
  confirm: {
    title: 'Confirme le code',
    subtitle: 'Entre-le une seconde fois',
    icon: <CheckIcon size={24} color={colors.accent} />,
  },
  biometric: {
    title: 'Encore plus de sécurité',
    subtitle: 'Active un second moyen de déverrouillage',
    icon: <UserIcon size={24} color={colors.accent} />,
  },
  done: {
    title: "C'est prêt !",
    subtitle: 'Bienvenue dans Notre Bulle',
    icon: <HeartIcon size={24} color={colors.accent} />,
  },
};

export default function SetupPinScreen() {
  const { checkAuth } = useAuth();

  const [step, setStep] = useState<SetupStep>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [bioFingerprint, setBioFingerprint] = useState(false);
  const [bioFace, setBioFace] = useState(false);
  const [hasFingerprint, setHasFingerprint] = useState(false);
  const [hasFace, setHasFace] = useState(false);

  const shakeAnim = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeAnim.value }],
  }));

  useEffect(() => {
    getHardwareBiometrics().then((hw) => {
      setHasFingerprint(hw.availableTypes.includes('fingerprint') && hw.isEnrolled);
      setHasFace(hw.availableTypes.includes('face') && hw.isEnrolled);
    });
  }, []);

  const triggerShake = useCallback((msg: string) => {
    setIsError(true);
    setErrorMsg(msg);
    shakeAnim.value = withSequence(
      withTiming(-10, { duration: 40 }),
      withTiming(10, { duration: 40 }),
      withTiming(-10, { duration: 40 }),
      withTiming(10, { duration: 40 }),
      withTiming(0, { duration: 40 })
    );
    setTimeout(() => setIsError(false), 400);
  }, []);

  const handleKeyPress = useCallback(
    async (key: string) => {
      if (key === '⌫') {
        if (step === 'create') setPin((p) => p.slice(0, -1));
        if (step === 'confirm') setConfirmPin((p) => p.slice(0, -1));
        setIsError(false);
        return;
      }
      if (key === '') return;

      if (step === 'create') {
        if (pin.length >= PIN_LENGTH) return;
        const newPin = pin + key;
        setPin(newPin);
        if (newPin.length === PIN_LENGTH) {
          setTimeout(() => setStep('confirm'), 250);
        }
      }

      if (step === 'confirm') {
        if (confirmPin.length >= PIN_LENGTH) return;
        const newConfirm = confirmPin + key;
        setConfirmPin(newConfirm);

        if (newConfirm.length === PIN_LENGTH) {
          if (newConfirm === pin) {
            const hash = await hashPin(newConfirm);
            await savePinHash(hash);
            if (hasFingerprint || hasFace) {
              setTimeout(() => setStep('biometric'), 300);
            } else {
              await markSetupDone();
              setTimeout(() => setStep('done'), 300);
            }
          } else {
            triggerShake('Les codes ne sont pas identiques');
            setTimeout(() => setConfirmPin(''), 400);
          }
        }
      }
    },
    [step, pin, confirmPin]
  );

  const handleFinishSetup = useCallback(async () => {
    await saveBiometricPrefs({ fingerprint: bioFingerprint, face: bioFace });
    await markSetupDone();
    setTimeout(() => setStep('done'), 200);
  }, [bioFingerprint, bioFace]);

  const goToChat = useCallback(async () => {
    await checkAuth();
    router.replace('/chat');
  }, [checkAuth]);

  const current = STEP_TITLES[step];

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View key={step} entering={FadeInDown.duration(500).springify()} style={styles.header}>
        <View style={styles.iconCircle}>
          {current.icon}
        </View>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.subtitle}>{current.subtitle}</Text>
      </Animated.View>

      {/* Step Indicator */}
      <View style={styles.stepsIndicator}>
        {(['create', 'confirm', 'biometric', 'done'] as const).map((s, i) => {
          const order: SetupStep[] = ['create', 'confirm', 'biometric', 'done'];
          const currentIdx = order.indexOf(step);
          const stepIdx = order.indexOf(s);
          const isActive = s === step;
          const isPast = stepIdx < currentIdx;
          return (
            <View
              key={s}
              style={[
                styles.stepDot,
                isActive && styles.stepDotActive,
                isPast && styles.stepDotPast,
              ]}
            />
          );
        })}
      </View>

      {/* PIN Input */}
      {(step === 'create' || step === 'confirm') && (
        <>
          <Animated.View entering={FadeIn.duration(300)} style={[styles.dotsContainer, shakeStyle]}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  (step === 'create' ? i < pin.length : i < confirmPin.length) && styles.dotFilled,
                  isError && styles.dotError,
                ]}
              />
            ))}
          </Animated.View>

          <View style={styles.numpad}>
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
                      style={styles.numKey}
                    >
                      <Text style={[styles.numKeyText, key === '⌫' && styles.numKeyTextSpecial]}>
                        {key === '⌫' ? '⌫' : key}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            ))}
          </View>

          {isError && <Text style={styles.errorText}>{errorMsg}</Text>}
        </>
      )}

      {/* Biométrie */}
      {step === 'biometric' && (
        <Animated.View entering={FadeInDown.duration(500)} style={styles.biometricContainer}>
          {hasFace && (
            <TouchableOpacity
              style={[styles.bioCard, bioFace && styles.bioCardActive]}
              onPress={() => setBioFace(!bioFace)}
              activeOpacity={0.7}
            >
              <UserIcon size={32} color={bioFace ? colors.accent : colors.textTertiary} />
              <View style={styles.bioTextContainer}>
                <Text style={styles.bioTitle}>Reconnaissance faciale</Text>
                <Text style={styles.bioDesc}>Déverrouille avec ton visage</Text>
              </View>
              <View style={[styles.checkbox, bioFace && styles.checkboxActive]}>
                {bioFace && <CheckIcon size={14} color="#FAFAF9" />}
              </View>
            </TouchableOpacity>
          )}

          {hasFingerprint && (
            <TouchableOpacity
              style={[styles.bioCard, bioFingerprint && styles.bioCardActive]}
              onPress={() => setBioFingerprint(!bioFingerprint)}
              activeOpacity={0.7}
            >
              <LockIcon size={32} color={bioFingerprint ? colors.accent : colors.textTertiary} />
              <View style={styles.bioTextContainer}>
                <Text style={styles.bioTitle}>Empreinte digitale</Text>
                <Text style={styles.bioDesc}>Déverrouille avec ton doigt</Text>
              </View>
              <View style={[styles.checkbox, bioFingerprint && styles.checkboxActive]}>
                {bioFingerprint && <CheckIcon size={14} color="#FAFAF9" />}
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleFinishSetup}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>
              {bioFace || bioFingerprint ? 'Activer et continuer' : 'Passer pour le moment'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Done */}
      {step === 'done' && (
        <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.doneContainer}>
          <TouchableOpacity style={styles.goButton} onPress={goToChat} activeOpacity={0.8}>
            <Text style={styles.goButtonText}>Commencer l'aventure</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  stepsIndicator: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 40,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
    width: 28,
    borderRadius: 4,
  },
  stepDotPast: {
    backgroundColor: colors.success,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
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
  },
  dotError: {
    backgroundColor: colors.error,
  },
  numpad: {
    gap: 14,
    marginBottom: 24,
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
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginTop: 8,
  },
  biometricContainer: {
    width: '100%',
    gap: 16,
    marginTop: 8,
  },
  bioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.md,
  },
  bioCardActive: {
    borderColor: colors.accent,
    backgroundColor: '#FFFBEB',
  },
  bioTextContainer: {
    flex: 1,
  },
  bioTitle: {
    ...typography.subheading,
    color: colors.text,
    marginBottom: 2,
  },
  bioDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  continueButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    shadowColor: colors.glowBurgundy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  continueButtonText: {
    color: '#FAFAF9',
    fontSize: 17,
    fontWeight: '600',
  },
  doneContainer: {
    width: '100%',
    marginTop: 40,
  },
  goButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    shadowColor: colors.glowBurgundy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  goButtonText: {
    color: '#FAFAF9',
    fontSize: 18,
    fontWeight: '600',
  },
});
