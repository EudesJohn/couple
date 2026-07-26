// ============================================================
// Bannière d'appel entrant — overlay plein écran
// avec boutons Répondre / Refuser
// ============================================================
import { motion, AnimatePresence } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { PhoneIcon, PhoneOffIcon, VideoIcon, HeartFilledIcon } from '../Icons';
import type { CallType } from '../../types/database';

interface IncomingCallBannerProps {
  visible: boolean;
  callType: CallType;
  partnerName: string;
  onAnswer: () => void;
  onReject: () => void;
}

export function IncomingCallBanner({
  visible,
  callType,
  partnerName,
  onAnswer,
  onReject,
}: IncomingCallBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 32px',
          }}
        >
          {/* Carte centrale */}
          <motion.div
            initial={{ scale: 0.85, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: 40 }}
            transition={{ type: 'spring', damping: 18, stiffness: 130 }}
            style={{
              width: '100%',
              maxWidth: 340,
              backgroundColor: colors.surface,
              borderRadius: borderRadius.xl + 4,
              padding: `${spacing.xl}px ${spacing.lg}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: `0 12px 40px rgba(0,0,0,0.4)`,
            }}
          >
            {/* Avatar animé */}
            <div style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.surfaceDim,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: spacing.lg,
              position: 'relative',
            }}>
              <motion.div
                animate={{
                  scale: [1, 1.08, 1],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HeartFilledIcon size={44} color={colors.accent} />
              </motion.div>
            </div>

            {/* Nom du partenaire */}
            <h2 style={{
              fontSize: 22,
              fontWeight: 700,
              color: colors.text,
              margin: 0,
              marginBottom: spacing.sm,
              textAlign: 'center',
            }}>
              {partnerName}
            </h2>

            {/* Type d'appel */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: spacing.xl,
            }}>
              {callType === 'video' ? (
                <VideoIcon size={16} color={colors.textSecondary} />
              ) : (
                <PhoneIcon size={16} color={colors.textSecondary} />
              )}
              <span style={{
                fontSize: 14,
                color: colors.textSecondary,
              }}>
                Appel {callType === 'video' ? 'vidéo' : 'audio'}
              </span>
            </div>

            {/* Boutons */}
            <div style={{
              display: 'flex',
              gap: 24,
              alignItems: 'center',
            }}>
              {/* Refuser */}
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onReject}
                aria-label="Refuser"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.error,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: `0 4px 14px ${colors.error}55`,
                }}
              >
                <PhoneOffIcon size={26} color="#FAFAF9" />
              </motion.button>

              {/* Répondre */}
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onAnswer}
                aria-label="Répondre"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: '#22C55E',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: `0 4px 14px #22C55E55`,
                }}
              >
                <PhoneIcon size={26} color="#FAFAF9" />
              </motion.button>
            </div>

            {/* Labels */}
            <div style={{
              display: 'flex',
              gap: 24,
              marginTop: spacing.sm,
            }}>
              <span style={{
                fontSize: 12,
                color: colors.textTertiary,
                width: 64,
                textAlign: 'center',
              }}>
                Refuser
              </span>
              <span style={{
                fontSize: 12,
                color: colors.textTertiary,
                width: 64,
                textAlign: 'center',
              }}>
                Répondre
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
