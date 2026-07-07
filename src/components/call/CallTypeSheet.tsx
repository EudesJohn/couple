// ============================================================
// CallTypeSheet — Bottom sheet premium pour choisir le type d'appel
// Design Burgundy & Gold, animations spring, SVG icons
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  FadeIn,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';
import { PhoneIcon, VideoIcon, CloseIcon } from '../Icons';

interface CallTypeSheetProps {
  visible: boolean;
  onClose: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
}

// ==========================================
// OPTION D'APPEL AVEC ANIMATION
// ==========================================
function CallOption({
  icon: Icon,
  label,
  description,
  gradient,
  onPress,
  delay,
}: {
  icon: React.FC<{ size: number; color: string }>;
  label: string;
  description: string;
  gradient: { bg: string; iconBg: string; iconColor: string };
  onPress: () => void;
  delay: number;
}) {
  const scale = useSharedValue(0);

  useEffect(() => {
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 10, stiffness: 120 });
    }, delay);
  }, [delay]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.optionCard, { backgroundColor: gradient.bg }]}>
        <View style={[styles.optionIconCircle, { backgroundColor: gradient.iconBg }]}>
          <Icon size={32} color={gradient.iconColor} />
        </View>
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionLabel}>{label}</Text>
          <Text style={styles.optionDesc}>{description}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const AUDIO_STYLE = {
  bg: '#7C2D12' + '12',
  iconBg: '#7C2D12' + '20',
  iconColor: colors.primary,
};

const VIDEO_STYLE = {
  bg: '#CA8A04' + '12',
  iconBg: '#CA8A04' + '20',
  iconColor: colors.accent,
};

export function CallTypeSheet({
  visible,
  onClose,
  onStartAudioCall,
  onStartVideoCall,
}: CallTypeSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 150 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(400, { duration: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.sheet, sheetStyle, { paddingBottom: insets.bottom + 20 }]}
        >
          {/* Poignée */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Appeler</Text>
              <Text style={styles.subtitle}>Choisis le type d'appel</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <CloseIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            <CallOption
              icon={PhoneIcon}
              label="Appel audio"
              description="Appel vocal classique"
              gradient={AUDIO_STYLE}
              onPress={() => { onClose(); onStartAudioCall(); }}
              delay={80}
            />
            <View style={styles.divider} />
            <CallOption
              icon={VideoIcon}
              label="Appel vidéo"
              description="Voir et parler en direct"
              gradient={VIDEO_STYLE}
              onPress={() => { onClose(); onStartVideoCall(); }}
              delay={160}
            />
          </View>

          {/* Bouton annuler */}
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl + 4,
    borderTopRightRadius: borderRadius.xl + 4,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.subheading,
    fontSize: 22,
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 14,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsContainer: {
    marginBottom: spacing.lg,
    gap: 0,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.md,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    marginVertical: 4,
  },
  optionIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    ...typography.subheading,
    fontSize: 17,
    color: colors.text,
    marginBottom: 3,
  },
  optionDesc: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 13,
  },
  cancelBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
});
