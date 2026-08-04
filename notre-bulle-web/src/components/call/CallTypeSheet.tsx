// ============================================================
// CallTypeSheet — Bottom sheet pour choisir le type d'appel
// Design Burgundy & Gold, animations Framer Motion
// ============================================================
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { PhoneIcon, VideoIcon, CloseIcon } from '../Icons';

interface CallTypeSheetProps {
  visible: boolean;
  onClose: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
}

function CallOption({
  icon: Icon, label, description, gradient, onPress, delay,
}: {
  icon: React.FC<{ size: number; color: string }>;
  label: string; description: string;
  gradient: { bg: string; iconBg: string; iconColor: string };
  onPress: () => void; delay: number;
}) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 14, stiffness: 180, delay }}
    >
      <button
        onClick={onPress}
        style={{
          display: 'flex', alignItems: 'center', width: '100%',
          backgroundColor: gradient.bg, border: 'none', cursor: 'pointer',
          borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.lg,
          fontFamily: 'inherit', textAlign: 'left', margin: '4px 0',
        }}
      >
        <div style={{
          width: 60, height: 60, borderRadius: 30,
          backgroundColor: gradient.iconBg,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          flexShrink: 0,
        }}>
          <Icon size={32} color={gradient.iconColor} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: colors.text, marginBottom: 3 }}>
            {label}
          </div>
          <div style={{ fontSize: 13, color: colors.textTertiary }}>
            {description}
          </div>
        </div>
      </button>
    </motion.div>
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
  visible, onClose, onStartAudioCall, onStartVideoCall,
}: CallTypeSheetProps) {
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
              position: 'relative', width: '100%', maxWidth: 400,
              backgroundColor: colors.surface,
              borderTopLeftRadius: borderRadius.xl + 4,
              borderTopRightRadius: borderRadius.xl + 4,
              padding: `${spacing.xl}px`,
              paddingTop: spacing.md,
              boxShadow: '0 -6px 24px rgba(0,0,0,0.2)',
            }}
          >
            {/* Handle */}
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              backgroundColor: colors.border, alignSelf: 'center',
              marginBottom: spacing.lg,
            }} />

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              marginBottom: spacing.xl,
            }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 600, color: colors.text, margin: 0, marginBottom: 4 }}>
                  Appeler
                </h2>
                <p style={{ fontSize: 14, color: colors.textTertiary, margin: 0 }}>
                  Choisis le type d'appel
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: colors.surfaceAlt, border: 'none', cursor: 'pointer',
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <CloseIcon size={18} color={colors.textSecondary} />
              </button>
            </div>

            {/* Options */}
            <div style={{ marginBottom: spacing.lg }}>
              <CallOption
                icon={PhoneIcon}
                label="Appel audio"
                description="Appel vocal classique"
                gradient={AUDIO_STYLE}
                onPress={() => { onClose(); onStartAudioCall(); }}
                delay={0.08}
              />
              <div style={{ height: 1, backgroundColor: colors.borderLight, margin: `0 ${spacing.md}px` }} />
              <CallOption
                icon={VideoIcon}
                label="Appel vidéo"
                description="Voir et parler en direct"
                gradient={VIDEO_STYLE}
                onPress={() => { onClose(); onStartVideoCall(); }}
                delay={0.16}
              />
            </div>

            {/* Annuler */}
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: `${spacing.md}px 0`,
                borderRadius: borderRadius.lg, border: 'none', cursor: 'pointer',
                backgroundColor: colors.surfaceAlt,
                color: colors.textSecondary, fontWeight: 600, fontSize: 16,
                fontFamily: 'inherit',
              }}
            >
              Annuler
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
