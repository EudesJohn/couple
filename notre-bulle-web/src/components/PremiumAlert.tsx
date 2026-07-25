// ============================================================
// PremiumAlert — Bottom sheet premium pour messages d'erreur/succès
// Design Burgundy & Gold, Framer Motion, icônes SVG
// ============================================================
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, borderRadius, spacing } from '../constants/theme';
import { AlertIcon, CheckIcon } from './Icons';

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

const ALERT_STYLES: Record<AlertType, {
  iconBg: string;
  iconColor: string;
  accent: string;
}> = {
  success: { iconBg: '#10B981' + '15', iconColor: '#10B981', accent: '#10B981' },
  error: { iconBg: '#DC2626' + '15', iconColor: '#DC2626', accent: '#DC2626' },
  warning: { iconBg: '#CA8A04' + '20', iconColor: colors.accent, accent: colors.accent },
  info: { iconBg: '#7C2D12' + '20', iconColor: colors.primary, accent: colors.primary },
};

export function PremiumAlert({
  visible, type = 'info', title, message, onClose, actionLabel, onAction,
}: PremiumAlertProps) {
  const style = ALERT_STYLES[type];
  const IconComponent = type === 'success' ? CheckIcon : AlertIcon;

  useEffect(() => {
    if (!visible) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [visible, onClose]);

  return (
    <AnimatePresence>
      {visible && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{
              position: 'absolute', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              cursor: 'pointer',
            }}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: 400 }}
            animate={{ y: 0 }}
            exit={{ y: 400 }}
            transition={{ type: 'spring', damping: 20, stiffness: 150 }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 400,
              backgroundColor: colors.surface,
              borderTopLeftRadius: borderRadius.xl + 4,
              borderTopRightRadius: borderRadius.xl + 4,
              padding: `${spacing.xl}px`,
              paddingTop: spacing.md,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 -6px 24px rgba(0,0,0,0.25)',
            }}
          >
            {/* Handle */}
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              backgroundColor: colors.border, alignSelf: 'center',
              marginBottom: spacing.xl,
            }} />

            {/* Icon */}
            <div style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: style.iconBg,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              marginBottom: spacing.lg,
            }}>
              <IconComponent size={28} color={style.iconColor} />
            </div>

            {/* Title */}
            <h2 style={{
              fontSize: 20, fontWeight: 600,
              color: type === 'error' ? '#DC2626' : colors.text,
              marginBottom: spacing.sm, textAlign: 'center',
            }}>
              {title}
            </h2>

            {/* Message */}
            <p style={{
              fontSize: 15, color: colors.textSecondary,
              textAlign: 'center', lineHeight: '22px',
              marginBottom: spacing.xl, padding: `0 ${spacing.md}px`,
            }}>
              {message}
            </p>

            {/* Actions */}
            <div style={{
              display: 'flex', gap: spacing.md, width: '100%',
            }}>
              {onAction && actionLabel ? (
                <>
                  <button
                    onClick={onClose}
                    style={{
                      flex: 1, padding: `${spacing.md}px 0`,
                      borderRadius: borderRadius.lg, border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surfaceAlt,
                      color: colors.textSecondary, fontWeight: 600, fontSize: 16,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => { onAction(); onClose(); }}
                    style={{
                      flex: 1, padding: `${spacing.md}px 0`,
                      borderRadius: borderRadius.lg, border: 'none',
                      backgroundColor: style.accent,
                      color: '#FAFAF9', fontWeight: 600, fontSize: 16,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {actionLabel}
                  </button>
                </>
              ) : (
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: `${spacing.md}px 0`,
                    borderRadius: borderRadius.lg, border: 'none',
                    backgroundColor: style.accent,
                    color: '#FAFAF9', fontWeight: 600, fontSize: 16,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  OK
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
