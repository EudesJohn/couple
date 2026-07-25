// ============================================================
// MediaPickerSheet — Bottom sheet pour ajouter média
// Design Burgundy & Gold, animations Framer Motion
// ============================================================
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { CameraIcon, ImageIcon, VideoIcon, CloseIcon } from '../Icons';

interface MediaPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
}

function MediaOption({
  icon: Icon, label, description, color, onPress, delay,
}: {
  icon: React.FC<{ size: number; color: string }>;
  label: string; description: string; color: string;
  onPress: () => void; delay: number;
}) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 10, stiffness: 120, delay }}
    >
      <button
        onClick={onPress}
        style={{
          display: 'flex', alignItems: 'center', width: '100%',
          backgroundColor: colors.surfaceAlt, border: 'none', cursor: 'pointer',
          borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.lg,
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: color + '15',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          flexShrink: 0,
        }}>
          <Icon size={28} color={color} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 2 }}>
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

export function MediaPickerSheet({
  visible, onClose, onTakePhoto, onPickImage, onPickVideo,
}: MediaPickerSheetProps) {
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
              backgroundColor: 'rgba(0,0,0,0.45)',
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
              boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
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
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: spacing.xl,
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: colors.text, margin: 0 }}>
                Ajouter un média
              </h2>
              <button
                onClick={onClose}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: colors.surfaceAlt, border: 'none', cursor: 'pointer',
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                }}
              >
                <CloseIcon size={18} color={colors.textSecondary} />
              </button>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginBottom: spacing.lg }}>
              <MediaOption
                icon={CameraIcon}
                label="Appareil photo"
                description="Prendre une photo maintenant"
                color={colors.primary}
                onPress={() => { onClose(); onTakePhoto(); }}
                delay={0.08}
              />
              <MediaOption
                icon={ImageIcon}
                label="Galerie"
                description="Choisir une photo existante"
                color={colors.accent}
                onPress={() => { onClose(); onPickImage(); }}
                delay={0.16}
              />
              <MediaOption
                icon={VideoIcon}
                label="Vidéo"
                description="Ajouter une vidéo"
                color={colors.primaryLight}
                onPress={() => { onClose(); onPickVideo(); }}
                delay={0.24}
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
