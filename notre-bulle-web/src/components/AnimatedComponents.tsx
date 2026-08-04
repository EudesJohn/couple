// ============================================================
// Composants animés réutilisables — Boutons, inputs, cartes
// Framer Motion remplace react-native-reanimated
// ============================================================
import { useState, type ReactNode } from 'react';
import { colors, borderRadius, spacing } from '../constants/theme';
import type { IconProps } from './Icons';

// ==========================================
// BOUTON PRINCIPAL AVEC ANIMATION
// ==========================================
interface AnimatedButtonProps {
  title: string;
  onClick: () => void;
  variant?: 'primary' | 'accent' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.FC<IconProps>;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export function AnimatedButton({
  title,
  onClick,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  disabled = false,
  fullWidth = false,
  style,
}: AnimatedButtonProps) {
  const isPrimary = variant === 'primary';
  const isAccent = variant === 'accent';
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';

  const sizeStyles: Record<string, { px: string; py: string; fontSize: number; iconSize: number }> = {
    sm: { px: '16px', py: '8px', fontSize: 14, iconSize: 16 },
    md: { px: '20px', py: '12px', fontSize: 16, iconSize: 18 },
    lg: { px: '24px', py: '16px', fontSize: 18, iconSize: 20 },
  };

  const s = sizeStyles[size];

  const bgColor = isPrimary ? colors.primary : isAccent ? colors.accent : 'transparent';
  const textColor = isPrimary || isAccent ? '#FAFAF9' : isOutline ? colors.primary : colors.text;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pressable"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: `${s.py} ${s.px}`,
        borderRadius: borderRadius.lg,
        backgroundColor: bgColor,
        border: isOutline ? `1.5px solid ${colors.primary}` : 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? '100%' : undefined,
        ...style,
      }}
    >
      {Icon && iconPosition === 'left' && (
        <Icon size={s.iconSize} color={textColor} />
      )}
      <span style={{ fontSize: s.fontSize, fontWeight: 600, color: textColor, letterSpacing: 0.2 }}>
        {title}
      </span>
      {Icon && iconPosition === 'right' && (
        <Icon size={s.iconSize} color={textColor} />
      )}
    </button>
  );
}

// ==========================================
// BOUTON ICÔNE ANIMÉ (rond)
// ==========================================
interface IconButtonProps {
  icon: React.FC<IconProps>;
  onClick: () => void;
  size?: number;
  color?: string;
  backgroundColor?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function IconButton({
  icon: Icon,
  onClick,
  size = 48,
  color = colors.text,
  backgroundColor = colors.surfaceAlt,
  disabled = false,
  style,
}: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pressable-sm"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: `0 2px 8px ${colors.shadowStrong}`,
        ...style,
      }}
    >
      <Icon size={size * 0.45} color={color} />
    </button>
  );
}

// ==========================================
// INPUT DE TEXTE
// ==========================================
interface AnimatedInputProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  type?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  icon?: React.FC<IconProps>;
  onSubmit?: () => void;
}

export function AnimatedInput({
  value,
  onChange,
  placeholder,
  multiline = false,
  maxLength,
  type = 'text',
  autoFocus = false,
  style,
  inputStyle,
  icon: Icon,
  onSubmit,
}: AnimatedInputProps) {
  const [focused, setFocused] = useState(false);

  const InputTag = multiline ? 'textarea' : 'input';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        border: `1.5px solid ${focused ? colors.accent : colors.border}`,
        padding: `0 ${spacing.lg}px`,
        gap: spacing.sm,
        transition: 'border-color 0.2s',
        ...style,
      }}
    >
      {Icon && (
        <div style={{ opacity: 0.5 }}>
          <Icon size={18} color={colors.textSecondary} />
        </div>
      )}
      <InputTag
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e: any) => { if (e.key === 'Enter' && !e.shiftKey && onSubmit) { e.preventDefault(); onSubmit(); } }}
        type={type}
        style={{
          flex: 1,
          fontSize: 16,
          color: colors.text,
          padding: `${spacing.md}px 0`,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          lineHeight: multiline ? '22px' : undefined,
          resize: 'none' as const,
          fontFamily: 'inherit',
          ...inputStyle,
        }}
      />
    </div>
  );
}

// ==========================================
// CARTE AVEC ANIMATION
// ==========================================
interface AnimatedCardProps {
  children: ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function AnimatedCard({ children, onClick, style }: AnimatedCardProps) {
  const Component = onClick ? 'button' : 'div';
  const className = onClick ? 'pressable' : undefined;

  return (
    <Component
      onClick={onClick}
      className={className}
      style={{
        backgroundColor: colors.surface,
        borderRadius: borderRadius.xl,
        padding: spacing.xl,
        boxShadow: `0 2px 12px ${colors.shadow}`,
        border: onClick ? 'none' : undefined,
        cursor: onClick ? 'pointer' : undefined,
        textAlign: 'left' as const,
        fontFamily: 'inherit',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </Component>
  );
}

// ==========================================
// SÉPARATEUR AVEC TEXTE
// ==========================================
interface DividerProps {
  text?: string;
  style?: React.CSSProperties;
}

export function Divider({ text, style }: DividerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.sm}px 0`,
        ...style,
      }}
    >
      <div style={{ flex: 1, height: 1, backgroundColor: colors.borderLight }} />
      {text && (
        <span style={{
          fontSize: 12, fontWeight: 500, color: colors.textTertiary,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          {text}
        </span>
      )}
      <div style={{ flex: 1, height: 1, backgroundColor: colors.borderLight }} />
    </div>
  );
}
