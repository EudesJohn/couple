// ============================================================
// Composants animés réutilisables — Boutons, inputs, cartes
// ============================================================
import React, { useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  type WithSpringConfig,
} from 'react-native-reanimated';
import { colors, borderRadius, spacing, typography } from '../constants/theme';
import type { IconProps } from './Icons';

// --- CONFIGURATION DU SPRING ---
const springConfig: WithSpringConfig = {
  damping: 12,
  mass: 0.5,
  stiffness: 200,
};

// ==========================================
// BOUTON PRINCIPAL AVEC ANIMATION
// ==========================================
interface AnimatedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.FC<IconProps>;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  disabled = false,
  fullWidth = false,
  style,
}: AnimatedButtonProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, springConfig);
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springConfig);
  }, []);

  const isPrimary = variant === 'primary';
  const isAccent = variant === 'accent';
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';

  const btnSizeStyles: Record<string, { px: number; py: number; fontSize: number; iconSize: number }> = {
    sm: { px: spacing.lg, py: spacing.sm, fontSize: 14, iconSize: 16 },
    md: { px: spacing.xl, py: spacing.md, fontSize: 16, iconSize: 18 },
    lg: { px: spacing.xxl, py: spacing.lg, fontSize: 18, iconSize: 20 },
  };

  const s = btnSizeStyles[size];

  return (
    <Animated.View style={[animatedStyle, fullWidth && { width: '100%' }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        disabled={disabled}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            paddingHorizontal: s.px,
            paddingVertical: s.py,
            borderRadius: borderRadius.lg,
            backgroundColor: isPrimary ? colors.primary : isAccent ? colors.accent : 'transparent',
            borderWidth: isOutline ? 1.5 : 0,
            borderColor: isOutline ? colors.primary : undefined,
            opacity: disabled ? 0.5 : 1,
          },
          isGhost && { backgroundColor: 'transparent' },
          style,
        ]}
      >
        {Icon && iconPosition === 'left' && (
          <View style={{ marginRight: 2 }}>
            <Icon size={s.iconSize} color={isPrimary || isAccent ? '#FAFAF9' : colors.primary} />
          </View>
        )}
        <Text
          style={{
            fontSize: s.fontSize,
            fontWeight: '600',
            color: isPrimary || isAccent ? '#FAFAF9' : isOutline ? colors.primary : colors.text,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </Text>
        {Icon && iconPosition === 'right' && (
          <View style={{ marginLeft: 2 }}>
            <Icon size={s.iconSize} color={isPrimary || isAccent ? '#FAFAF9' : colors.primary} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ==========================================
// BOUTON ICÔNE ANIMÉ (rond)
// ==========================================
interface IconButtonProps {
  icon: React.FC<IconProps>;
  onPress: () => void;
  size?: number;
  color?: string;
  backgroundColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon: Icon,
  onPress,
  size = 48,
  color = colors.text,
  backgroundColor = colors.surfaceAlt,
  disabled = false,
  style,
}: IconButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.88, springConfig);
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springConfig);
  }, []);

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        disabled={disabled}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: disabled ? 0.5 : 1,
            shadowColor: colors.shadowStrong,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 1,
            shadowRadius: 8,
            elevation: 4,
          },
          style,
        ]}
      >
        <Icon size={size * 0.45} color={color} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ==========================================
// INPUT DE TEXTE
// ==========================================
interface AnimatedInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  secureTextEntry?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  icon?: React.FC<IconProps>;
  onSubmitEditing?: () => void;
}

export function AnimatedInput({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLength,
  secureTextEntry = false,
  autoFocus = false,
  style,
  inputStyle,
  icon: Icon,
  onSubmitEditing,
}: AnimatedInputProps) {
  const borderColor = useSharedValue<string>(colors.border);

  const animatedBorder = useAnimatedStyle(() => ({
    borderColor: borderColor.value as string,
  }));

  const handleFocus = useCallback(() => {
    borderColor.value = colors.accent;
  }, []);

  const handleBlur = useCallback(() => {
    borderColor.value = colors.border;
  }, []);

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: borderRadius.md,
          borderWidth: 1.5,
          paddingHorizontal: spacing.lg,
          gap: spacing.sm,
        },
        animatedBorder,
        style,
      ]}
    >
      {Icon && (
        <View style={{ opacity: 0.5 }}>
          <Icon size={18} color={colors.textSecondary} />
        </View>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          {
            flex: 1,
            fontSize: 16,
            color: colors.text,
            paddingVertical: spacing.md,
            lineHeight: multiline ? 22 : undefined,
          },
          inputStyle,
        ]}
      />
    </Animated.View>
  );
}

// ==========================================
// CARTE AVEC ANIMATION
// ==========================================
interface AnimatedCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedCard({ children, onPress, style }: AnimatedCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, springConfig);
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springConfig);
  }, []);

  const content = (
    <Animated.View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.xl,
          padding: spacing.xl,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 1,
          shadowRadius: 12,
          elevation: 3,
        },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// ==========================================
// SÉPARATEUR AVEC TEXTE
// ==========================================
interface DividerProps {
  text?: string;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ text, style }: DividerProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      {text && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '500',
            color: colors.textTertiary,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {text}
        </Text>
      )}
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}
