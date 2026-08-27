// ============================================================
// 🔐 Écran de Verrouillage — Design Premium Burgundy & Gold
// Ordre : identité (Elle/Lui) → code PIN → accès au chat
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  useSharedValue,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';
import { saveIdentity, getIdentity, type UserIdentity } from '../src/lib/auth';
import { HeartFilledIcon, UserIcon, ChevronLeftIcon } from '../src/components/Icons';
import { supabase } from '../src/lib/supabase';
import { config } from '../src/constants/config';

const PIN_LENGTH = 4;
const { width } = Dimensions.get('window');
const KEY_SIZE = (width - 64 - 40) / 3;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

type LockStep = 'identity' | 'pin';

export default function LockScreen() {
  const {
    status,
    isFirstLaunch,
    unlockWithPin,
    unlockWithBiometrics,
    biometricPrefs,
    hardwareBiometrics,
    createPinOnServer,
    checkAuth,
  } = useAuth();

  const [step, setStep] = useState<LockStep>('identity');
  const [selectedIdentity, setSelectedIdentity] = useState<UserIdentity | null>(null);
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // --- Profils depuis Supabase (comme le web) ---
  const [profiles, setProfiles] = useState<{
    woman: { name: string; avatar: string | null } | null;
    man: { name: string; avatar: string | null } | null;
  }>({ woman: null, man: null });

  useEffect(() => {
    const ids = [config.myProfileId, config.partnerProfileId].filter(Boolean);
    if (ids.length === 0) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', ids);
        if (!data) return;
        const woman = data.find((p) => p.id === config.myProfileId) ?? null;
        const man = data.find((p) => p.id === config.partnerProfileId) ?? null;
        setProfiles({
          woman: woman ? { name: woman.display_name, avatar: woman.avatar_url } : null,
          man: man ? { name: man.display_name, avatar: man.avatar_url } : null,
        });
      } catch {}
    })();
  }, []);

  const shakeAnim = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);

  // ── Détection biométrie ──
  const [bioFingerprint, setBioFingerprint] = useState(false);
  const [bioFace, setBioFace] = useState(false);
  const [hasFingerprint, setHasFingerprint] = useState(false);
  const [hasFace, setHasFace] = useState(false);

  // ── Animation glow pulsante ──
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

  // ── Au démarrage : récupérer identité + biométrie ──
  useEffect(() => {
    (async () => {
      const identity = await getIdentity();
      if (identity) {
        setSelectedIdentity(identity);
        setStep('pin');
      }
      try {
        const LocalAuth = await import('expo-local-authentication');
        const [hasHW, isEnrolled, types] = await Promise.all([
          LocalAuth.hasHardwareAsync(),
          LocalAuth.isEnrolledAsync(),
          LocalAuth.supportedAuthenticationTypesAsync(),
        ]);
        setHasFingerprint(types.includes(LocalAuth.AuthenticationType.FINGERPRINT) && isEnrolled);
        setHasFace(types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION) && isEnrolled);
      } catch {}
    })();
  }, []);

  // ── Redirections selon le statut ──
  useEffect(() => {
    if (status === 'unlocked') {
      router.replace('/chat');
    }
  }, [status]);

  // ── Tentative biométrie auto au démarrage ──
  useEffect(() => {
    const tryBiometric = async () => {
      if (step !== 'pin') return;
      if (!(biometricPrefs.fingerprint || biometricPrefs.face)) return;
      if (status === 'setupPin') return;
      try {
        const LocalAuth = await import('expo-local-authentication');
        const result = await LocalAuth.authenticateAsync({
          promptMessage: 'Déverrouiller Notre Bulle',
          fallbackLabel: 'Utiliser le code PIN',
        });
        if (result.success) {
          await unlockWithBiometrics();
        }
      } catch {}
    };
    const timer = setTimeout(tryBiometric, 800);
    return () => clearTimeout(timer);
  }, [step, biometricPrefs, status]);

  // ── Animation shake ──
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeAnim.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const triggerShake = useCallback((msg?: string) => {
    setIsError(true);
    if (msg) setErrorMsg(msg);
    shakeAnim.value = withSequence(
      withTiming(-12, { duration: 40 }),
      withTiming(12, { duration: 40 }),
      withTiming(-12, { duration: 40 }),
      withTiming(12, { duration: 40 }),
      withTiming(0, { duration: 40 })
    );
    setTimeout(() => setIsError(false), 2000);
  }, []);

  // ── Sélection identité → re-vérifie le statut serveur ──
  const handlePickIdentity = useCallback(async (role: UserIdentity) => {
    await saveIdentity(role);
    setSelectedIdentity(role);
    setStep('pin');
    // Re-vérifier l'état du serveur après avoir choisi l'identité
    // (checkAuth lit maintenant le bon profil)
    try {
      await checkAuth();
    } catch {}
  }, [checkAuth]);

  // ── Saisie du code PIN ──
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
        console.log(`🔑 PIN saisi, status auth = "${status}"`);

        if (status === 'setupPin') {
          // Aucun PIN sur le serveur → création
          if (isSettingUp) return;
          setIsSettingUp(true);
          console.log('🔐 Création du PIN sur le serveur...');
          const result = await createPinOnServer(newPin);
          setIsSettingUp(false);
          console.log('🔐 Résultat création:', result);
          if (result.ok) {
            setTimeout(() => router.replace('/chat'), 350);
          } else {
            // Un code existe déjà → il faut le saisir
            setAttempts((a) => a + 1);
            triggerShake(result.error || 'Erreur serveur');
            setTimeout(() => setPin(''), 400);
          }
        } else {
          // Déverrouillage (status = 'locked', 'onboarding', ou autre)
          console.log('🔓 Tentative de déverrouillage...');
          const valid = await unlockWithPin(newPin);
          console.log('🔓 Résultat déverrouillage:', valid);
          if (valid) {
            setTimeout(() => router.replace('/chat'), 350);
          } else {
            setAttempts((a) => a + 1);
            triggerShake('Code incorrect');
            setTimeout(() => setPin(''), 400);
          }
        }
      }
    },
    [pin, unlockWithPin, createPinOnServer, status, isSettingUp, triggerShake]
  );

  const hasBiometrics =
    hardwareBiometrics.hasHardware && (biometricPrefs.fingerprint || biometricPrefs.face);

  if (status === 'loading') return null;

  return (
    <View style={styles.container}>
      {/* Fond décoratif */}
      <View style={styles.decorativeTop}>
        <View style={styles.glowCircle} />
      </View>

      {/* ═══════════ ÉTAPE 1 : IDENTITÉ ═══════════ */}
      {step === 'identity' && (
        <Animated.View entering={FadeInDown.duration(800).springify()} style={styles.identitySection}>
          <View style={styles.logoContainer}>
            <Animated.View style={[styles.glowRing, glowStyle]} />
            <HeartFilledIcon size={48} color={colors.accent} />
          </View>
          <Text style={styles.title}>Notre Bulle</Text>
          <Text style={styles.subtitle}>Qui ouvres la bulle ?</Text>

          <View style={styles.identityCards}>
            <TouchableOpacity
              style={styles.identityCard}
              onPress={() => handlePickIdentity('woman')}
              activeOpacity={0.7}
            >
              <View style={[styles.identityAvatar, { backgroundColor: colors.glowBurgundy }]}>
                {profiles.woman?.avatar ? (
                  <Image source={{ uri: profiles.woman.avatar }} style={styles.identityAvatarImg} />
                ) : (
                  <UserIcon size={28} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.identityTitle}>{profiles.woman?.name || 'Elle'}</Text>
                <Text style={styles.identitySubtitle}>Je suis elle</Text>
              </View>
              <View style={styles.identityRadio} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.identityCard}
              onPress={() => handlePickIdentity('man')}
              activeOpacity={0.7}
            >
              <View style={[styles.identityAvatar, { backgroundColor: colors.surfaceAlt2 || colors.surfaceDim }]}> 
                {profiles.man?.avatar ? (
                  <Image source={{ uri: profiles.man.avatar }} style={styles.identityAvatarImg} />
                ) : (
                  <UserIcon size={28} color={colors.accentDark || colors.accent} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.identityTitle}>{profiles.man?.name || 'Lui'}</Text>
                <Text style={styles.identitySubtitle}>Je suis lui</Text>
              </View>
              <View style={styles.identityRadio} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ═══════════ ÉTAPE 2 : CODE PIN ═══════════ */}
      {step === 'pin' && (
        <>
          <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.branding}>
            <View style={styles.logoContainer}>
              <Animated.View style={[styles.glowRing, glowStyle]} />
              <HeartFilledIcon size={48} color={colors.accent} />
            </View>
            <Text style={styles.title}>Notre Bulle</Text>
            <Text style={styles.subtitle}>
              {status === 'setupPin'
                ? 'Crée le code secret à 4 chiffres'
                : `Bienvenue ${selectedIdentity === 'woman' ? 'Elle' : 'Lui'}`}
            </Text>
          </Animated.View>

          {/* Bouton retour identité */}
          <TouchableOpacity
            style={styles.backToIdentity}
            onPress={() => {
              setPin('');
              setErrorMsg('');
              setAttempts(0);
              setStep('identity');
            }}
            activeOpacity={0.7}
          >
            <ChevronLeftIcon size={16} color={colors.primary} />
            <Text style={styles.backText}>Changer d'identité</Text>
          </TouchableOpacity>

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

          {isError && errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {isSettingUp && (
            <Text style={styles.loadingText}>Création du code...</Text>
          )}

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
          {hasBiometrics && status !== 'setupPin' && (
            <Animated.View entering={FadeIn.duration(600).delay(600)} style={styles.biometricContainer}>
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={() => unlockWithBiometrics()}
                activeOpacity={0.7}
              >
                <Text style={styles.biometricText}>Déverrouillage biométrique</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Tentatives */}
          {attempts > 0 && status !== 'setupPin' && (
            <Text style={styles.attemptsText}>
              Code incorrect · {3 - Math.min(attempts, 3)} tentative{3 - Math.min(attempts, 3) > 1 ? 's' : ''} restante{3 - Math.min(attempts, 3) <= 1 ? '' : 's'}
            </Text>
          )}
        </>
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

  // ── Identité ──
  identitySection: {
    alignItems: 'center',
    width: '100%',
  },
  identityCards: {
    width: '100%',
    gap: 16,
    marginTop: 40,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  identityTitle: {
    ...typography.subheading,
    color: colors.text,
    marginBottom: 2,
  },
  identitySubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  identityAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  identityAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  identityRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
  },

  // ── Branding / logo ──
  branding: {
    alignItems: 'center',
    marginBottom: 20,
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

  // ── Bouton retour identité ──
  backToIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },

  // ── PIN ──
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
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
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
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
