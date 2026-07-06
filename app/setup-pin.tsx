// ============================================================
// 🔐 Configuration initiale — PIN + Biométrie
// Étapes : Créer PIN → Confirmer → Biométrie → Terminé
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSequence,
  withTiming,
  useSharedValue,
  FadeIn,
} from 'react-native-reanimated';
import { colors, typography } from '../src/constants/theme';
import { hashPin, savePinHash, saveBiometricPrefs, getHardwareBiometrics, markSetupDone } from '../src/lib/auth';
import { useAuth } from '../src/hooks/useAuth';

const PIN_LENGTH = 4;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

type SetupStep = 'create' | 'confirm' | 'biometric' | 'done';

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

  // Vérifier le matériel biométrique au montage
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
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(0, { duration: 50 })
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
      if (key === '' || key === '') return;

      if (step === 'create') {
        if (pin.length >= PIN_LENGTH) return;
        const newPin = pin + key;
        setPin(newPin);

        // Vérification auto à 4 chiffres → passe à "confirmer"
        if (newPin.length === PIN_LENGTH) {
          setTimeout(() => {
            setStep('confirm');
          }, 200);
        }
      }

      if (step === 'confirm') {
        if (confirmPin.length >= PIN_LENGTH) return;
        const newConfirm = confirmPin + key;
        setConfirmPin(newConfirm);

        if (newConfirm.length === PIN_LENGTH) {
          if (newConfirm === pin) {
            // ✅ PIN confirmé → sauvegarder
            const hash = await hashPin(newConfirm);
            await savePinHash(hash);

            // Proposer la biométrie si disponible
            if (hasFingerprint || hasFace) {
              setTimeout(() => {
                setStep('biometric');
              }, 300);
            } else {
              await markSetupDone();
              setTimeout(() => {
                setStep('done');
              }, 300);
            }
          } else {
            // ❌ Les codes ne correspondent pas
            triggerShake('Les codes ne sont pas identiques');
            setTimeout(() => setConfirmPin(''), 400);
          }
        }
      }
    },
    [step, pin, confirmPin]
  );

  // Activer la biométrie et finir
  const handleFinishSetup = useCallback(async () => {
    await saveBiometricPrefs({
      fingerprint: bioFingerprint,
      face: bioFace,
    });
    await markSetupDone();

    // Petite animation de transition
    setTimeout(() => {
      setStep('done');
    }, 200);
  }, [bioFingerprint, bioFace]);

  // Aller au chat
  const goToChat = useCallback(async () => {
    await checkAuth();
    router.replace('/chat');
  }, [checkAuth]);

  // Rendu dépendant de l'étape
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.branding}>
        <Text style={styles.emoji}>{step === 'done' ? '💕' : '💫'}</Text>
        <Text style={styles.title}>
          {step === 'create' && 'Crée ton code secret'}
          {step === 'confirm' && 'Confirme le code'}
          {step === 'biometric' && 'Encore plus de sécurité'}
          {step === 'done' && 'C\'est prêt !'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'create' && 'Choisis un code à 4 chiffres'}
          {step === 'confirm' && 'Entre-le une seconde fois'}
          {step === 'biometric' && 'Active un second moyen de déverrouillage'}
          {step === 'done' && 'Bienvenue dans Notre Bulle 💫'}
        </Text>
      </View>

      {/* Step indicator */}
      <View style={styles.stepsIndicator}>
        {(['create', 'confirm', 'biometric', 'done'] as const).map((s, i) => (
          <View
            key={s}
            style={[
              styles.stepDot,
              (step === s || (s === 'done' && step === 'done')) && styles.stepDotActive,
              getStepStatus(step, s, i),
            ]}
          />
        ))}
      </View>

      {/* PIN création / confirmation */}
      {(step === 'create' || step === 'confirm') && (
        <>
          {/* Dots */}
          <Animated.View style={[styles.dotsContainer, shakeStyle]}>
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

          {/* Code PIN saisi */}
          <Text style={styles.pinHidden}>
            {(step === 'create' ? pin : confirmPin)
              .split('')
              .map(() => '●')
              .join(' ') || ' '}
          </Text>

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
                      style={styles.numpadKey}
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

          {isError && <Text style={styles.errorText}>{errorMsg}</Text>}
        </>
      )}

      {/* Étape Biométrie */}
      {step === 'biometric' && (
        <Animated.View
          entering={FadeIn.duration(400)}
          style={styles.biometricContainer}
        >
          {hasFace && (
            <TouchableOpacity
              style={[
                styles.bioCard,
                bioFace && styles.bioCardActive,
              ]}
              onPress={() => setBioFace(!bioFace)}
            >
              <Text style={styles.bioIcon}>👤</Text>
              <Text style={styles.bioTitle}>Reconnaissance faciale</Text>
              <Text style={styles.bioDesc}>
                Déverrouille avec ton visage
              </Text>
              <View
                style={[
                  styles.checkbox,
                  bioFace && styles.checkboxActive,
                ]}
              >
                {bioFace && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          )}

          {hasFingerprint && (
            <TouchableOpacity
              style={[
                styles.bioCard,
                bioFingerprint && styles.bioCardActive,
              ]}
              onPress={() => setBioFingerprint(!bioFingerprint)}
            >
              <Text style={styles.bioIcon}>👆</Text>
              <Text style={styles.bioTitle}>Empreinte digitale</Text>
              <Text style={styles.bioDesc}>
                Déverrouille avec ton doigt
              </Text>
              <View
                style={[
                  styles.checkbox,
                  bioFingerprint && styles.checkboxActive,
                ]}
              >
                {bioFingerprint && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleFinishSetup}
          >
            <Text style={styles.continueButtonText}>
              {bioFace || bioFingerprint
                ? 'Activer et continuer'
                : 'Passer pour le moment'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Étape "Terminé" */}
      {step === 'done' && (
        <Animated.View
          entering={FadeIn.duration(500)}
          style={styles.doneContainer}
        >
          <TouchableOpacity style={styles.goButton} onPress={goToChat}>
            <Text style={styles.goButtonText}>Let's go 💬</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

function getStepStatus(current: SetupStep, step: SetupStep, index: number) {
  const order: SetupStep[] = ['create', 'confirm', 'biometric', 'done'];
  const currentIdx = order.indexOf(current);
  const stepIdx = order.indexOf(step);

  if (stepIdx < currentIdx) {
    return { backgroundColor: colors.success };
  }
  return {};
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },

  // Branding
  branding: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 12,
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

  // Step indicator
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
    width: 24,
  },

  // Dots
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
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
  pinHidden: {
    fontSize: 24,
    letterSpacing: 8,
    color: colors.textSecondary,
    marginBottom: 36,
    height: 30,
  },

  // Numpad
  numpad: {
    gap: 14,
    marginBottom: 24,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
  },
  numpadKey: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  numpadKeyPlaceholder: {
    width: 72,
    height: 72,
  },
  numpadKeyText: {
    fontSize: 26,
    fontWeight: '500',
    color: colors.text,
  },
  numpadKeyTextSpecial: {
    fontSize: 22,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginTop: 8,
  },

  // Biométrie
  biometricContainer: {
    width: '100%',
    gap: 16,
    marginTop: 16,
  },
  bioCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    position: 'relative',
  },
  bioCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#FFF5F8',
  },
  bioIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  bioTitle: {
    ...typography.subheading,
    fontSize: 18,
    color: colors.text,
    marginBottom: 4,
  },
  bioDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  checkbox: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  // Done
  doneContainer: {
    width: '100%',
    marginTop: 40,
  },
  goButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  goButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
