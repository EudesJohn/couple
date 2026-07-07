// ============================================================
// Parametres premium — Pseudo, PIN, theme, fond ecran
// Design Burgundy & Gold, animations spring, cartes animees
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  Image, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius } from '../src/constants/theme';
import { supabase } from '../src/lib/supabase';
import { hashPin, savePinHash, verifyPin, getStoredPinHash } from '../src/lib/auth';
import { saveTheme, saveBackgroundImage, removeBackgroundImage, type ChatTheme } from '../src/lib/settings';
import { compressImage } from '../src/lib/media';
import {
  BackIcon, SettingsIcon, HeartFilledIcon, UserIcon, LockIcon,
  EditIcon, CameraIcon, CheckIcon, CloseIcon, ImageIcon,
} from '../src/components/Icons';
import { PremiumAlert } from '../src/components/PremiumAlert';

const THEMES: (ChatTheme & { name: string })[] = [
  { name: 'Rose', bg: '#FAF6F9', bubbleSelf: '#E8A0B4', bubbleOther: '#F0EBF3' },
  { name: 'Lavande', bg: '#F8F4FC', bubbleSelf: '#B8A9C9', bubbleOther: '#EDE8F3' },
  { name: 'Peche', bg: '#FEF8F4', bubbleSelf: '#F4C7AB', bubbleOther: '#F5EDE8' },
  { name: 'Ocean', bg: '#F0F7FA', bubbleSelf: '#7BC4E8', bubbleOther: '#E8F0F5' },
  { name: 'Foret', bg: '#F4F9F4', bubbleSelf: '#7BC4A9', bubbleOther: '#E8F3ED' },
  { name: 'Nuit', bg: '#1A1120', bubbleSelf: '#E8A0B4', bubbleOther: '#2D1B36' },
];

// ==========================================
// BOUTON ANIME AVEC SPRING + DISABLED
// ==========================================
function AnimBtn({ onPress, children, style, disabled }: {
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const busyRef = useRef(false);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: disabled ? 0.96 : scale.value }],
    opacity: withTiming(disabled ? 0.5 : 1),
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={() => {
          if (disabled || busyRef.current) return;
          busyRef.current = true;
          onPress();
          setTimeout(() => { busyRef.current = false; }, 400);
        }}
        onPressIn={() => {
          if (!disabled) scale.value = withSpring(0.92, { damping: 12, stiffness: 200 });
        }}
        onPressOut={() => {
          if (!disabled) scale.value = withSpring(1, { damping: 10, stiffness: 150 });
        }}
        activeOpacity={1}
        disabled={disabled}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ==========================================
// BOUTON THEME ANIME (spring sur la card)
// ==========================================
function ThemeCardBtn({ theme, isSelected, onPress }: {
  theme: typeof THEMES[0];
  isSelected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const busy = useRef(false);

  return (
    <Animated.View style={{ transform: [{ scale: scale.value }], width: '47%' }}>
      <TouchableOpacity
        onPress={() => {
          if (busy.current) return;
          busy.current = true;
          onPress();
          setTimeout(() => { busy.current = false; }, 300);
        }}
        onPressIn={() => { scale.value = withSpring(0.94, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10 }); }}
        activeOpacity={0.8}
        style={[
          styles.themeCard,
          { backgroundColor: theme.bg },
          isSelected && styles.themeCardSelected,
        ]}
      >
        <View style={styles.themeCardPreview}>
          <View style={[styles.themeBubbleSelf, { backgroundColor: theme.bubbleSelf }]} />
          <View style={[styles.themeBubbleOther, { backgroundColor: theme.bubbleOther }]} />
        </View>
        <Text style={[styles.themeName, theme.name === 'Nuit' && { color: '#FAFAF9' }]}>
          {theme.name}
        </Text>
        {isSelected && (
          <View style={styles.themeCheck}>
            <CheckIcon size={12} color="#FAFAF9" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ==========================================
// SECTION CARD ANIMEE (entrée stagger)
// ==========================================
function SectionCard({ title, icon: Icon, delay = 0, children }: {
  title: string;
  icon?: React.FC<{ size: number; color: string }>;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify().delay(delay)}
      style={styles.section}
    >
      {Icon && (
        <View style={styles.sectionHeaderRow}>
          <Icon size={15} color={colors.primary} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      )}
      {!Icon && <Text style={styles.sectionTitle}>{title}</Text>}
      {children}
    </Animated.View>
  );
}

// ==========================================
// TOAST DE FEEDBACK
// ==========================================
function ToastFeedback({ message, visible }: { message: string; visible: boolean }) {
  const translateY = useSharedValue(60);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 14, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 150 });
      scale.value = withSpring(1, { damping: 12, stiffness: 180 });
    } else {
      translateY.value = withTiming(60, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, animStyle]}>
      <CheckIcon size={16} color="#FAFAF9" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ==========================================
// NKEY — Touche du clavier PIN avec animation
// ==========================================
function PinKey({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const busy = useRef(false);

  return (
    <Animated.View style={{ transform: [{ scale: scale.value }] }}>
      <TouchableOpacity
        onPress={() => {
          if (busy.current) return;
          busy.current = true;
          onPress();
          setTimeout(() => { busy.current = false; }, 80);
        }}
        onPressIn={() => { scale.value = withSpring(0.88, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10 }); }}
        activeOpacity={1}
        style={styles.numpadKey}
      >
        <Text style={styles.numpadKeyText}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState(0);
  const [bgPreview, setBgPreview] = useState<string | null>(null);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingPseudo, setSavingPseudo] = useState(false);
  const [applyingTheme, setApplyingTheme] = useState(false);

  // Premium Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({ type: 'info', title: '', message: '' });

  const showAlert = useCallback((type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ type, title, message });
    setAlertVisible(true);
  }, []);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2200);
  }, []);

  // PIN
  const [showPinChange, setShowPinChange] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'old' | 'new' | 'confirm'>('old');
  const [pinError, setPinError] = useState('');

  // Get Supabase user ID
  const getUserId = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
    const { config } = await import('../src/constants/config');
    return config.myProfileId ?? null;
  }, []);

  // Load profile
  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('supabase_uid', userId)
        .single();
      if (profile) {
        setDisplayName(profile.display_name);
        setNewDisplayName(profile.display_name);
        setAvatar(profile.avatar_url);
      }
    })();
  }, [getUserId]);

  // Save display name
  const saveDisplayName = useCallback(async () => {
    if (!newDisplayName.trim()) {
      showAlert('error', 'Pseudo vide', 'Le pseudo ne peut pas etre vide');
      return;
    }
    if (savingPseudo) return;
    setSavingPseudo(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        showAlert('error', 'Connexion', 'Tu dois etre connecte pour changer ton pseudo');
        setSavingPseudo(false);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: newDisplayName.trim() })
        .eq('supabase_uid', userId);
      if (error) throw error;
      setDisplayName(newDisplayName.trim());
      showToast('Pseudo modifie');
    } catch (err: any) {
      showAlert('error', 'Erreur', err?.message || 'Impossible de modifier le pseudo');
    } finally { setSavingPseudo(false); }
  }, [newDisplayName, getUserId, showToast, showAlert, savingPseudo]);

  // PIN handler
  const handlePinKey = useCallback(async (key: string) => {
    if (key === '⌫') {
      if (pinStep === 'old') setOldPin(p => p.slice(0, -1));
      if (pinStep === 'new') setNewPin(p => p.slice(0, -1));
      if (pinStep === 'confirm') setConfirmPin(p => p.slice(0, -1));
      setPinError('');
      return;
    }

    if (pinStep === 'old' && oldPin.length < 4) {
      const newVal = oldPin + key;
      setOldPin(newVal);
      if (newVal.length === 4) {
        const storedHash = await getStoredPinHash();
        const valid = storedHash ? await verifyPin(newVal, storedHash) : false;
        if (valid) {
          setOldPin('');
          setPinStep('new');
        } else {
          setPinError('Ancien code incorrect');
          setTimeout(() => setOldPin(''), 400);
        }
      }
    } else if (pinStep === 'new' && newPin.length < 4) {
      const newVal = newPin + key;
      setNewPin(newVal);
      if (newVal.length === 4) {
        setPinStep('confirm');
      }
    } else if (pinStep === 'confirm' && confirmPin.length < 4) {
      const newVal = confirmPin + key;
      setConfirmPin(newVal);
      if (newVal.length === 4) {
        if (newVal === newPin) {
          const hash = await hashPin(newVal);
          await savePinHash(hash);
          showToast('Code PIN modifie');
          setShowPinChange(false);
          setOldPin('');
          setNewPin('');
          setConfirmPin('');
          setPinStep('old');
        } else {
          setPinError('Les codes ne correspondent pas');
          setTimeout(() => setConfirmPin(''), 400);
        }
      }
    }
  }, [pinStep, oldPin, newPin, confirmPin, showToast]);

  // Upload image to Supabase
  const uploadImageToStorage = useCallback(async (
    userId: string, uri: string, folder: 'avatars' | 'backgrounds'
  ): Promise<string> => {
    const fileName = `${userId}.jpg`;
    const filePath = `${folder}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, {
        uri, type: 'image/jpeg', name: fileName,
      } as any, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
    return publicUrl;
  }, []);

  // Select photo
  const handleSelectPhoto = useCallback(async () => {
    try {
      const { launchImageLibraryAsync } = await import('expo-image-picker');
      const result = await launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1],
      });
      if (!result.canceled && result.assets[0]) setPhotoPreview(result.assets[0].uri);
    } catch (err: any) {
      showAlert('error', 'Erreur', err?.message || 'Impossible de choisir la photo');
    }
  }, [showAlert]);

  // Confirm photo
  const handleConfirmPhoto = useCallback(async () => {
    if (!photoPreview || uploading) return;
    setUploading(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        showAlert('error', 'Connexion', 'Tu dois etre connecte a Supabase');
        setUploading(false);
        return;
      }
      const compressedUri = await compressImage(photoPreview);
      const publicUrl = await uploadImageToStorage(userId, compressedUri, 'avatars');
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('supabase_uid', userId);
      if (updateError) throw updateError;
      setAvatar(publicUrl);
      setPhotoPreview(null);
      showToast('Photo mise a jour');
    } catch (err: any) {
      showAlert('error', 'Erreur', err?.message || 'Impossible de changer la photo');
    } finally { setUploading(false); }
  }, [photoPreview, getUserId, uploadImageToStorage, showToast, showAlert, uploading]);

  const handleCancelPhoto = useCallback(() => { setPhotoPreview(null); }, []);

  // Pick background
  const handlePickBackground = useCallback(async () => {
    if (uploading) return;
    try {
      const { launchImageLibraryAsync } = await import('expo-image-picker');
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setUploading(true);
        const userId = await getUserId();
        if (!userId) {
          showAlert('error', 'Connexion', 'Tu dois etre connecte');
          setUploading(false);
          return;
        }
        const compressedUri = await compressImage(uri);
        const publicUrl = await uploadImageToStorage(userId, compressedUri, 'backgrounds');
        await saveBackgroundImage(publicUrl);
        setBgPreview(publicUrl);
        showToast('Fond d ecran applique');
        setUploading(false);
      }
    } catch (err: any) {
      setUploading(false);
      showAlert('error', 'Erreur', err?.message || 'Impossible de changer le fond');
    }
  }, [getUserId, uploadImageToStorage, showToast, showAlert, uploading]);

  const handleRemoveBackground = useCallback(async () => {
    await removeBackgroundImage();
    setBgPreview(null);
    showToast('Fond d ecran retire');
  }, [showToast]);

  const pinDots = pinStep === 'old' ? oldPin : pinStep === 'new' ? newPin : confirmPin;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header premium */}
      <View style={styles.header}>
        <AnimBtn onPress={() => router.back()}>
          <View style={styles.backButton}>
            <BackIcon size={20} color={colors.primary} />
          </View>
        </AnimBtn>
        <View style={styles.headerTitleRow}>
          <SettingsIcon size={18} color={colors.text} />
          <Text style={styles.headerTitle}>Parametres</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* --- Photo de profil --- */}
        <SectionCard title="Photo de profil" icon={UserIcon} delay={0}>
          {photoPreview ? (
            <View style={styles.photoPreviewContainer}>
              <Image source={{ uri: photoPreview }} style={styles.photoPreviewImage} resizeMode="cover" />
              <View style={styles.photoPreviewActions}>
                <AnimBtn onPress={handleCancelPhoto} disabled={uploading}>
                  <View style={styles.cancelPhotoBtn}>
                    <CloseIcon size={16} color={colors.error} />
                    <Text style={styles.cancelPhotoText}>Annuler</Text>
                  </View>
                </AnimBtn>
                <AnimBtn onPress={handleConfirmPhoto} disabled={uploading}>
                  <View style={styles.confirmPhotoBtn}>
                    {uploading ? (
                      <ActivityIndicator size="small" color="#FAFAF9" />
                    ) : (
                      <>
                        <CheckIcon size={16} color="#FAFAF9" />
                        <Text style={styles.confirmPhotoText}>Valider</Text>
                      </>
                    )}
                  </View>
                </AnimBtn>
              </View>
            </View>
          ) : (
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={handleSelectPhoto} activeOpacity={1}>
                <View style={styles.avatarOuterRing}>
                  <View style={styles.avatarContainer}>
                    <View style={styles.avatar}>
                      {avatar ? (
                        <Image source={{ uri: avatar }} style={styles.avatarImage} />
                      ) : (
                        <HeartFilledIcon size={36} color={colors.accent} />
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.changePhotoRow}>
                  <CameraIcon size={14} color={colors.primary} />
                  <Text style={styles.changePhotoText}>Changer la photo</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </SectionCard>

        {/* --- Pseudo --- */}
        <SectionCard title="Pseudo" icon={EditIcon} delay={60}>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={newDisplayName}
              onChangeText={setNewDisplayName}
              placeholder="Ton pseudo"
              placeholderTextColor={colors.textTertiary}
              maxLength={30}
              editable={!savingPseudo}
            />
            <AnimBtn onPress={saveDisplayName} disabled={savingPseudo}>
              <View style={styles.saveButton}>
                {savingPseudo ? (
                  <ActivityIndicator size="small" color="#FAFAF9" />
                ) : (
                  <Text style={styles.saveButtonText}>Sauver</Text>
                )}
              </View>
            </AnimBtn>
          </View>
        </SectionCard>

        {/* --- Code PIN --- */}
        <SectionCard title="Code secret" icon={LockIcon} delay={120}>
          <TouchableOpacity
            onPress={() => setShowPinChange(!showPinChange)}
            style={styles.optionRow}
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>
              {showPinChange ? 'Annuler' : 'Changer le code PIN'}
            </Text>
          </TouchableOpacity>

          {showPinChange && (
            <Animated.View entering={FadeIn.duration(250)} style={styles.pinChangeContainer}>
              <Text style={styles.pinStepText}>
                {pinStep === 'old' && 'Entre ton code actuel'}
                {pinStep === 'new' && 'Nouveau code a 4 chiffres'}
                {pinStep === 'confirm' && 'Confirme le nouveau code'}
              </Text>

              <View style={styles.pinDots}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <View key={i} style={[
                    styles.pinDot,
                    i < pinDots.length && styles.pinDotFilled,
                  ]} />
                ))}
              </View>

              {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}

              <View style={styles.numpad}>
                {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']].map((row, ri) => (
                  <View key={ri} style={styles.numpadRow}>
                    {row.map((k) =>
                      k === '' ? <View key="e" style={styles.numpadKeyPlaceholder} /> :
                      <PinKey key={k} label={k} onPress={() => handlePinKey(k)} />
                    )}
                  </View>
                ))}
              </View>
            </Animated.View>
          )}
        </SectionCard>

        {/* --- Theme --- */}
        <SectionCard title="Theme" icon={HeartFilledIcon} delay={180}>
          <View style={styles.themesGrid}>
            {THEMES.map((theme, i) => (
              <ThemeCardBtn
                key={i}
                theme={theme}
                isSelected={selectedTheme === i}
                onPress={async () => {
                  if (applyingTheme) return;
                  setApplyingTheme(true);
                  setSelectedTheme(i);
                  await saveTheme({ bg: theme.bg, bubbleSelf: theme.bubbleSelf, bubbleOther: theme.bubbleOther });
                  setApplyingTheme(false);
                  showToast('Theme applique');
                }}
              />
            ))}
          </View>
        </SectionCard>

        {/* --- Fond d'ecran --- */}
        <SectionCard title="Fond d ecran" icon={ImageIcon} delay={240}>
          {bgPreview && (
            <View style={styles.bgPreviewContainer}>
              <Image source={{ uri: bgPreview }} style={styles.bgPreviewImage} resizeMode="cover" />
              <AnimBtn onPress={handleRemoveBackground} disabled={uploading}>
                <View style={styles.removeBgBtn}>
                  <CloseIcon size={14} color={colors.error} />
                  <Text style={styles.removeBgText}>Enlever</Text>
                </View>
              </AnimBtn>
            </View>
          )}

          <AnimBtn onPress={bgPreview ? handleRemoveBackground : handlePickBackground} disabled={uploading}>
            <View style={styles.changeBgBtn}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <ImageIcon size={18} color={colors.primary} />
              )}
              <Text style={styles.changeBgText}>
                {uploading ? 'Chargement...' : bgPreview ? 'Changer la photo' : 'Choisir une photo'}
              </Text>
            </View>
          </AnimBtn>

          {!bgPreview && (
            <Text style={styles.bgHint}>
              Photo personnelle en arriere-plan de votre discussion
            </Text>
          )}
        </SectionCard>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Premium Alert */}
      <PremiumAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertVisible(false)}
      />

      {/* Toast */}
      <View style={[styles.toastContainer, { bottom: insets.bottom + 100 }]}>
        <ToastFeedback message={toastMsg} visible={toastVisible} />
      </View>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    gap: 20,
    paddingBottom: 40,
  },

  // Section card
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.subheading,
    fontSize: 15,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Avatar
  avatarSection: { alignItems: 'center', paddingVertical: spacing.sm },
  avatarOuterRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2.5,
    borderColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarContainer: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  changePhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  changePhotoText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '500',
    fontSize: 14,
  },

  // Photo preview
  photoPreviewContainer: { alignItems: 'center', gap: spacing.md },
  photoPreviewImage: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, borderColor: colors.border,
  },
  photoPreviewActions: { flexDirection: 'row', gap: spacing.lg },
  cancelPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  cancelPhotoText: { color: colors.error, fontWeight: '500', fontSize: 14 },
  confirmPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: borderRadius.pill, backgroundColor: colors.primary,
    minWidth: 100, justifyContent: 'center',
  },
  confirmPhotoText: { color: '#FAFAF9', fontWeight: '600', fontSize: 14 },

  // Pseudo
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minWidth: 72,
    alignItems: 'center',
  },
  saveButtonText: { color: '#FAFAF9', fontWeight: '600', fontSize: 14 },

  // PIN
  optionRow: { paddingVertical: 4 },
  optionText: { ...typography.body, color: colors.primary, fontWeight: '500' },
  pinChangeContainer: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.md },
  pinStepText: { ...typography.body, color: colors.text, fontSize: 15 },
  pinDots: { flexDirection: 'row', gap: 12 },
  pinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.border },
  pinDotFilled: { backgroundColor: colors.primary },
  pinError: { color: colors.error, fontSize: 13 },
  numpad: { gap: 10, alignItems: 'center' },
  numpadRow: { flexDirection: 'row', gap: 16 },
  numpadKey: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center', alignItems: 'center',
  },
  numpadKeyPlaceholder: { width: 64, height: 64 },
  numpadKeyText: { fontSize: 24, fontWeight: '500', color: colors.text },

  // Themes
  themesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
  themeCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
    position: 'relative',
  },
  themeCardSelected: { borderColor: colors.primary },
  themeCardPreview: { gap: 4 },
  themeBubbleSelf: { width: 44, height: 18, borderRadius: 9, alignSelf: 'flex-end' },
  themeBubbleOther: { width: 44, height: 18, borderRadius: 9 },
  themeName: { fontSize: 13, fontWeight: '500', color: colors.text, marginTop: 2 },
  themeCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },

  // Background
  bgPreviewContainer: { marginBottom: spacing.md, borderRadius: borderRadius.md, overflow: 'hidden' },
  bgPreviewImage: { width: '100%', height: 120, borderRadius: borderRadius.md },
  removeBgBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  removeBgText: { ...typography.body, color: colors.error, fontWeight: '500' },
  changeBgBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
  },
  changeBgText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  bgHint: {
    ...typography.caption, color: colors.textTertiary,
    textAlign: 'center', marginTop: spacing.sm, fontStyle: 'italic',
  },

  // Toast
  toastContainer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'none' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: borderRadius.pill,
    shadowColor: colors.success, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  toastText: { color: '#FAFAF9', fontSize: 14, fontWeight: '600' },
});
