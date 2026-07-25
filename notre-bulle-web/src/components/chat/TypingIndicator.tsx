// ============================================================
// Indicateur "écrit..." — design premium avec animation Framer Motion
// ============================================================
import { motion } from 'framer-motion';
import { colors, spacing, borderRadius } from '../../constants/theme';

interface TypingIndicatorProps {
  name: string;
}

function Dot({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0.3 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.4,
        repeat: Infinity,
        repeatType: 'reverse',
        delay,
      }}
      style={{
        width: 7, height: 7, borderRadius: 3.5,
        backgroundColor: colors.primary,
      }}
    />
  );
}

export function TypingIndicator({ name }: TypingIndicatorProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: `${spacing.xs}px ${spacing.lg}px`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surface,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: borderRadius.md,
        border: `1px solid ${colors.borderLight}`,
      }}>
        <Dot delay={0} />
        <Dot delay={0.15} />
        <Dot delay={0.3} />
      </div>
      <span style={{
        fontSize: 13, color: colors.textSecondary, fontStyle: 'italic',
      }}>
        {name} écrit...
      </span>
    </div>
  );
}
