// ============================================================
// MediaPickerSheet — Bottom sheet premium pour ajouter média
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
import { CameraIcon, ImageIcon, CloseIcon } from '../Icons';

interface MediaPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onPickVideo?: () => void;
}

// ==========================================
// BOUTON MÉDIA AVEC ANIMATION
// ==========================================
function MediaOption({
  icon: Icon,
  label,
  description,
  color,
  onPress,
  delay,
}: {
  icon: React.FC<{ size: number; color: string }>;
  label: string;
  description: string;
  color: string;
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
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.optionCard}>
        <View style={[styles.optionIconCircle, { backgroundColor: color + '15' }]}>
          <Icon size={28} color={color} />
        </View>
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionLabel}>{label}</Text>
          <Text style={styles.optionDesc}>{description}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function MediaPickerSheet({
  visible,
  onClose,
  onTakePhoto,
  onPickImage,
}: MediaPickerSheetProps) {
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
            <Text style={styles.title}>Ajouter un média</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <CloseIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            <MediaOption
              icon={CameraIcon}
              label="Appareil photo"
              description="Prendre une photo maintenant"
              color={colors.primary}
              onPress={() => { onClose(); onTakePhoto(); }}
              delay={80}
            />
            <MediaOption
              icon={ImageIcon}
              label="Galerie"
              description="Choisir une photo existante"
              color={colors.accent}
              onPress={() => { onClose(); onPickImage(); }}
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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl + 4,
    borderTopRightRadius: borderRadius.xl + 4,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.subheading,
    fontSize: 20,
    color: colors.text,
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
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  optionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    ...typography.subheading,
    fontSize: 16,
    color: colors.text,
    marginBottom: 2,
  },
  optionDesc: {
    ...typography.caption,
    color: colors.textTertiary,
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
  },
});
