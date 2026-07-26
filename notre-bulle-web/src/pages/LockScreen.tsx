// ============================================================
// 🔐 Écran de Verrouillage — Design Premium Burgundy & Gold
// PIN 4 chiffres
// 1ʳᵉ connexion : codes préréglés 1234 (Femme) / 1235 (Homme)
// Connexions suivantes : vérification du PIN personnalisé
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius, fonts } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { getIdentityLabel, type UserIdentity } from '../lib/auth';
import { LockIcon, HeartFilledIcon, HeartIcon } from '../components/Icons';

const PIN_LENGTH = 4;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

// ==========================================
// Cœurs flottants — animation romantique
// ==========================================
function FloatingHearts() {
  const hearts = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      delay: i * 0.8 + Math.random() * 0.4,
      duration: 3.5 + Math.random() * 3,
      size: 10 + Math.random() * 18,
    })),
  []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {hearts.map((h) => (
        <motion.div
          key={h.id}
          initial={{ opacity: 0, y: 0, x: `${h.x}%` }}
          animate={{
            opacity: [0, 0.2, 0.15, 0],
            y: [0, -80, -160, -260],
          }}
          transition={{
            duration: h.duration,
            delay: h.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          style={{ position: 'absolute', bottom: -30 }}
        >
          <HeartFilledIcon size={h.size} color={colors.accent} />
        </motion.div>
      ))}
    </div>
  );
}

// ==========================================
// Écran de bienvenue après identification
// ==========================================
function WelcomeScreen({ role }: { role: UserIdentity }) {
  const navigate = useNavigate();
  const label = getIdentityLabel(role);

  useEffect(() => {
    const t = setTimeout(() => navigate('/chat', { replace: true }), 2200);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
        padding: '0 32px',
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.2 }}
        style={{ marginBottom: 28 }}
      >
        <HeartFilledIcon size={72} color={colors.accent} />
      </motion.div>
      <h1 style={{
        fontFamily: fonts.display,
        fontSize: 38,
        fontWeight: 400,
        color: colors.primary,
        margin: 0, marginBottom: 12,
        textAlign: 'center',
      }}>
        Bienvenue
      </h1>
      <p style={{
        fontFamily: fonts.body,
        fontSize: 19,
        fontStyle: 'italic',
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: '28px',
        margin: 0,
      }}>
        {label}, tu es chez toi ❤️
      </p>
    </motion.div>
  );
}

export default function LockScreen() {
  const navigate = useNavigate();
  const { isFirstLaunch, identity, unlockWithPin, setupFirstIdentity } = useAuth();
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [welcomeRole, setWelcomeRole] = useState<UserIdentity | null>(null);

  const handleKeyPress = useCallback(
    async (key: string) => {
      if (key === '⌫') {
        setPin((prev) => prev.slice(0, -1));
        setIsError(false);
        setErrorMsg('');
        return;
      }

      if (key === '' || pin.length >= PIN_LENGTH) return;

      const newPin = pin + key;
      setPin(newPin);

      if (newPin.length === PIN_LENGTH) {
        if (isFirstLaunch) {
          // --- 1ʳᵉ CONNEXION : reconnaissance par code préréglé ---
          const role = await setupFirstIdentity(newPin);
          if (role) {
            setWelcomeRole(role);
          } else {
            setIsError(true);
            setErrorMsg('Code invalide · utilise 1234 (Femme) ou 1235 (Homme)');
            setShakeKey((k) => k + 1);
            setTimeout(() => setPin(''), 400);
            setTimeout(() => setIsError(false), 2000);
          }
        } else {
          // --- CONNEXIONS SUIVANTES : vérification PIN hashé ---
          const valid = await unlockWithPin(newPin);
          if (valid) {
            setTimeout(() => navigate('/chat', { replace: true }), 350);
          } else {
            setAttempts((a) => a + 1);
            setIsError(true);
            setErrorMsg('Code incorrect');
            setShakeKey((k) => k + 1);
            setTimeout(() => setPin(''), 400);
            setTimeout(() => setIsError(false), 500);
          }
        }
      }
    },
    [pin, isFirstLaunch, unlockWithPin, setupFirstIdentity, navigate]
  );

  // Écran de bienvenue après identification réussie
  if (welcomeRole) {
    return <WelcomeScreen role={welcomeRole} />;
  }

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
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        backgroundColor: colors.background,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Cœurs flottants */}
      <FloatingHearts />

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
          fontFamily: fonts.display,
          fontSize: 38,
          fontWeight: 400,
          letterSpacing: 0.5,
          color: colors.primary,
          margin: 0, marginBottom: 6,
        }}>
          Notre Bulle
        </h1>
        <p style={{
          fontFamily: fonts.body,
          fontSize: 17,
          fontStyle: 'italic',
          color: colors.textSecondary,
          textAlign: 'center',
          margin: 0,
        }}>
          {isFirstLaunch
            ? 'Première connexion · entre ton code'
            : 'Déverrouille pour nous rejoindre'}
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
                  aria-label={key === '⌫' ? 'Effacer' : `Chiffre ${key}`}
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

      {/* Erreur / Indice */}
      {errorMsg && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            fontSize: 13,
            color: isError ? colors.error : colors.textTertiary,
            marginTop: spacing.lg,
            textAlign: 'center',
          }}
        >
          {errorMsg}
        </motion.p>
      )}

      {/* Tentatives (mode déverrouillage uniquement) */}
      {!isFirstLaunch && attempts > 0 && !errorMsg && (
        <p style={{
          fontSize: 13, color: colors.error, marginTop: spacing.lg,
        }}>
          Code incorrect · {3 - Math.min(attempts, 3)} tentative{3 - Math.min(attempts, 3) > 1 ? 's' : ''} restante{3 - Math.min(attempts, 3) <= 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
