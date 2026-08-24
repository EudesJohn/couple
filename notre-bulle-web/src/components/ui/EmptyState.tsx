// ============================================================
// EmptyState — état vide élégant (aucun appel, aucune photo…)
// Icône dans un cercle doux, titre, sous-titre, CTA optionnel
// Design Burgundy & Gold
// ============================================================
import { motion } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';

interface EmptyStateProps {
  icon: React.FC<{ size: number; color: string }>;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${spacing.huge}px ${spacing.xl}px`,
        textAlign: 'center',
      }}
    >
      <div style={{
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: colors.surfaceAlt,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.xl,
      }}>
        <Icon size={40} color={colors.accent} />
      </div>

      <h3 style={{
        fontSize: 18,
        fontWeight: 600,
        color: colors.text,
        margin: 0,
        marginBottom: spacing.sm,
        letterSpacing: -0.3,
      }}>
        {title}
      </h3>

      {subtitle && (
        <p style={{
          fontSize: 14,
          color: colors.textSecondary,
          margin: 0,
          marginBottom: actionLabel ? spacing.xl : 0,
          maxWidth: 280,
          lineHeight: '21px',
        }}>
          {subtitle}
        </p>
      )}

      {actionLabel && onAction && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onAction}
          style={{
            backgroundColor: colors.primary,
            color: '#FAFAF9',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            padding: `${spacing.md}px ${spacing.xl}px`,
            borderRadius: borderRadius.pill,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            boxShadow: `0 4px 12px ${colors.glowBurgundy}`,
            marginTop: spacing.lg,
          }}
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}
