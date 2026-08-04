// ============================================================
// Enregistrement vocal premium — animations amplitude
// Design Burgundy & Gold, Framer Motion
// ============================================================
import { motion } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { ArrowUpIcon, StopIcon } from '../Icons';

interface VoiceRecorderProps {
  durationMs: number;
  isRecording: boolean;
  onStop: () => void;
  onCancel: () => void;
  onSend: () => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const AMPLITUDE_HEIGHTS = [0.3, 0.5, 0.7, 1.0, 0.8, 0.6, 0.4, 0.7, 0.9, 0.5];

export function VoiceRecorder({
  durationMs, isRecording, onStop, onCancel, onSend,
}: VoiceRecorderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `${spacing.md}px`,
        backgroundColor: colors.surface,
        borderTop: `1px solid ${colors.border}`,
        gap: spacing.sm,
      }}
    >
      {/* Annuler */}
      <button
        onClick={onCancel}
        style={{
          padding: `${spacing.sm}px`,
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 16, color: colors.textSecondary }}>Annuler</span>
      </button>

      {/* Visualisation + Timer */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <motion.div
            animate={{ opacity: [1, 0.2] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
            style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: colors.error,
            }}
          />
          <span style={{
            fontSize: 11, fontWeight: 600, color: colors.error, letterSpacing: 1,
          }}>
            {isRecording ? 'ENREGISTREMENT' : 'TERMINÉ'}
          </span>
        </div>

        {/* Amplitude bars */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          height: 40,
        }}>
          {AMPLITUDE_HEIGHTS.map((h, i) => (
            <motion.div
              key={i}
              animate={{
                height: isRecording
                  ? 16 + (0.2 + Math.random() * 0.8) * 28
                  : 16 + h * 28,
              }}
              transition={{ duration: 0.3 + Math.random() * 0.4, repeat: Infinity, repeatType: 'reverse' }}
              style={{
                width: 3,
                borderRadius: 1.5,
                backgroundColor: colors.primary,
              }}
            />
          ))}
        </div>

        <span style={{ fontSize: 18, fontWeight: 600, color: colors.text }}>
          {formatTime(durationMs)}
        </span>
      </div>

      {/* Stop / Send */}
      {isRecording ? (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onStop}
          style={{
            width: 44, height: 44, borderRadius: 22, border: 'none', cursor: 'pointer',
            backgroundColor: colors.error,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            boxShadow: `0 4px 12px ${colors.error}80`,
            flexShrink: 0,
          }}
        >
          <StopIcon size={18} color="#FAFAF9" />
        </motion.button>
      ) : (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onSend}
          style={{
            width: 44, height: 44, borderRadius: 22, border: 'none', cursor: 'pointer',
            backgroundColor: colors.primary,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            boxShadow: `0 4px 12px ${colors.glowBurgundy}`,
            flexShrink: 0,
          }}
        >
          <ArrowUpIcon size={20} color="#FAFAF9" />
        </motion.button>
      )}
    </motion.div>
  );
}
