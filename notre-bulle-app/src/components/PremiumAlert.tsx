// ============================================================
// PremiumAlert — Bottom sheet premium pour messages d'erreur/succès
// Design Burgundy & Gold, animations spring, icônes SVG
// Remplace Alert.alert() dans toute l'app
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
import { colors, borderRadius, spacing, typography } from '../constants/theme';
import {
  AlertIcon, CheckIcon, CloseIcon,
} from './Icons';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface PremiumAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message: string;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

// ==========================================
// CONFIG PAR TYPE
// ==========================================
const ALERT_STYLES: Record<AlertType, {
  iconBg: string;
  iconColor: string;
  accent: string;
  cardBg: string;
}> = {
  success: {
    iconBg: '#10B981' + '15',
    iconColor: '#10B981',
    accent: '#10B981',
    cardBg: '#10B981' + '08',
  },
  error: {
    iconBg: '#DC2626' + '15',
    iconColor: '#DC2626',
    accent: '#DC2626',
    cardBg: '#DC2626' + '08',
  },
  warning: {
    iconBg: '#CA8A04' + '20',
    iconColor: colors.accent,
    accent: colors.accent,
    cardBg: '#CA8A04' + '08',
  },
  info: {
    iconBg: '#7C2D12' + '20',
    iconColor: colors.primary,
    accent: colors.primary,
    cardBg: '#7C2D12' + '08',
  },
};

// ==========================================
// PREMIUM ALERT
// ==========================================
export function PremiumAlert({
  visible,
  type = 'info',
  title,
  message,
  onClose,
  actionLabel,
  onAction,
}: PremiumAlertProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  const style = ALERT_STYLES[type];

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

  const IconComponent = type === 'success' ? CheckIcon : AlertIcon;

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
          {/* Handle */}
          <View style={styles.handle} />

          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: style.iconBg }]}>
            <IconComponent size={28} color={style.iconColor} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: type === 'error' ? '#DC2626' : colors.text }]}>
            {title}
          </Text>

          {/* Message */}
          <Text style={styles.message}>{message}</Text>

          {/* Actions */}
          <View style={styles.actions}>
            {onAction && actionLabel ? (
              <>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.actionBtn, styles.secondaryBtn]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { onAction(); onClose(); }}
                  style={[styles.actionBtn, { backgroundColor: style.accent }]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>{actionLabel}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={onClose}
                style={[styles.actionBtn, { backgroundColor: style.accent }]}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ==========================================
// STYLES
// ==========================================
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
    paddingBottom: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FAFAF9',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
});
