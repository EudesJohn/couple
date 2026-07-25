// ============================================================
// 🔐 Écran de Verrouillage — Design Premium Burgundy & Gold
// PIN 4 chiffres, animations Framer Motion
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { LockIcon, HeartFilledIcon } from '../components/Icons';

const PIN_LENGTH = 4;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

export default function LockScreen() {
  const navigate = useNavigate();
  const { isFirstLaunch, unlockWithPin } = useAuth();
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);

  // Rediriger si premier lancement
  useEffect(() => {
    if (isFirstLaunch) {
      navigate('/setup-pin', { replace: true });
    }
  }, [isFirstLaunch, navigate]);

  const handleKeyPress = useCallback(
    async (key: string) => {
      if (key === '⌫') {
        setPin((prev) => prev.slice(0, -1));
        setIsError(false);
        return;
      }

      if (key === '' || pin.length >= PIN_LENGTH) return;

      const newPin = pin + key;
      setPin(newPin);

      if (newPin.length === PIN_LENGTH) {
        const valid = await unlockWithPin(newPin);
        if (valid) {
          setTimeout(() => navigate('/chat', { replace: true }), 350);
        } else {
          setAttempts((a) => a + 1);
          setIsError(true);
          setShakeKey((k) => k + 1);
          setTimeout(() => setPin(''), 400);
          setTimeout(() => setIsError(false), 500);
        }
      }
    },
    [pin, unlockWithPin, navigate]
  );

  if (isFirstLaunch) return null;

  const KEY_SIZE = Math.min((window.innerWidth - 64 - 40) / 3, 100);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        backgroundColor: colors.background,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Fond décoratif */}
      <div
        style={{
          position: 'absolute',
          top: -120,
          left: -120,
          right: -120,
          height: 300,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: 400,
            height: 400,
            borderRadius: 200,
            backgroundColor: colors.glowBurgundy,
            margin: '0 auto',
            opacity: 0.5,
          }}
        />
      </div>

      {/* Branding */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, type: 'spring', stiffness: 100 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 48,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: colors.surface,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 20,
            boxShadow: `0 4px 16px ${colors.shadowStrong}`,
            position: 'relative',
          }}
        >
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 50,
              border: `2px solid ${colors.accent}`,
              opacity: 0.3,
            }}
          />
          <HeartFilledIcon size={48} color={colors.accent} />
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 700, letterSpacing: -0.5,
          color: colors.text, margin: 0, marginBottom: 8,
        }}>
          Notre Bulle
        </h1>
        <p style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', margin: 0 }}>
          Déverrouille pour nous rejoindre
        </p>
      </motion.div>

      {/* PIN Dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 44,
          height: 16,
          alignItems: 'center',
        }}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key={shakeKey}
            animate={isError ? {
              x: [0, -12, 12, -12, 12, 0],
            } : {}}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', gap: 16 }}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: isError
                    ? colors.error
                    : i < pin.length
                      ? colors.primary
                      : colors.border,
                  boxShadow: i < pin.length && !isError
                    ? `0 0 8px ${colors.glowBurgundy}`
                    : undefined,
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Numpad */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32, position: 'relative', zIndex: 1 }}
      >
        {NUMPAD_KEYS.map((row, rIdx) => (
          <div key={rIdx} style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
            {row.map((key) =>
              key === '' ? (
                <div key="empty" style={{ width: KEY_SIZE, height: KEY_SIZE }} />
              ) : (
                <motion.button
                  key={key}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleKeyPress(key)}
                  style={{
                    width: KEY_SIZE,
                    height: KEY_SIZE,
                    borderRadius: borderRadius.lg,
                    backgroundColor: key === '⌫' ? 'transparent' : colors.surface,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    boxShadow: key === '⌫' ? 'none' : `0 2px 8px ${colors.shadow}`,
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    fontSize: key === '⌫' ? 22 : 28,
                    fontWeight: key === '⌫' ? 400 : 500,
                    color: key === '⌫' ? colors.textSecondary : colors.text,
                  }}>
                    {key === '⌫' ? '⌫' : key}
                  </span>
                </motion.button>
              )
            )}
          </div>
        ))}
      </motion.div>

      {/* Tentatives */}
      {attempts > 0 && (
        <p style={{
          fontSize: 13, color: colors.error, marginTop: spacing.lg,
        }}>
          Code incorrect · {3 - Math.min(attempts, 3)} tentative{3 - Math.min(attempts, 3) > 1 ? 's' : ''} restante{3 - Math.min(attempts, 3) <= 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
