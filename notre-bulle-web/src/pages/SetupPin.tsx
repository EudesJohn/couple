// ============================================================
// 🔐 Configuration initiale — PIN uniquement (pas de biométrie)
// Design Premium Burgundy & Gold
// ============================================================
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius } from '../constants/theme';
import { hashPin, savePinHash, markSetupDone } from '../lib/auth';
import { CheckIcon, LockIcon, HeartIcon } from '../components/Icons';

const PIN_LENGTH = 4;

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

type SetupStep = 'create' | 'confirm' | 'done';

export default function SetupPin() {
  const navigate = useNavigate();

  const [step, setStep] = useState<SetupStep>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  const triggerShake = useCallback((msg: string) => {
    setIsError(true);
    setErrorMsg(msg);
    setShakeKey((k) => k + 1);
    setTimeout(() => setIsError(false), 400);
  }, []);

  const handleKeyPress = useCallback(
    async (key: string) => {
      if (key === '⌫') {
        if (step === 'create') setPin((p) => p.slice(0, -1));
        if (step === 'confirm') setConfirmPin((p) => p.slice(0, -1));
        setIsError(false);
        return;
      }
      if (key === '') return;

      if (step === 'create') {
        if (pin.length >= PIN_LENGTH) return;
        const newPin = pin + key;
        setPin(newPin);
        if (newPin.length === PIN_LENGTH) {
          setTimeout(() => setStep('confirm'), 250);
        }
      }

      if (step === 'confirm') {
        if (confirmPin.length >= PIN_LENGTH) return;
        const newConfirm = confirmPin + key;
        setConfirmPin(newConfirm);

        if (newConfirm.length === PIN_LENGTH) {
          if (newConfirm === pin) {
            const hash = await hashPin(newConfirm);
            await savePinHash(hash);
            await markSetupDone();
            setTimeout(() => setStep('done'), 300);
          } else {
            triggerShake('Les codes ne sont pas identiques');
            setTimeout(() => setConfirmPin(''), 400);
          }
        }
      }
    },
    [step, pin, confirmPin, triggerShake]
  );

  const goToChat = () => {
    navigate('/chat', { replace: true });
  };

  const currentStepDots = step === 'create' ? pin : confirmPin;

  const KEY_SIZE = Math.min((window.innerWidth - 64 - 40) / 3, 100);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '100px 32px 0',
        backgroundColor: colors.background,
      }}
    >
      {/* Header */}
      <motion.div
        key={step}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 15 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 28,
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: colors.surface,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            marginBottom: 16,
            boxShadow: `0 2px 8px ${colors.shadow}`,
          }}
        >
          {step === 'create' && <LockIcon size={24} color={colors.accent} />}
          {step === 'confirm' && <CheckIcon size={24} color={colors.accent} />}
          {step === 'done' && <HeartIcon size={24} color={colors.accent} />}
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 700, letterSpacing: -0.5,
          color: colors.text, margin: 0, marginBottom: 6, textAlign: 'center',
        }}>
          {step === 'create' && 'Crée ton code secret'}
          {step === 'confirm' && 'Confirme le code'}
          {step === 'done' && "C'est prêt !"}
        </h1>
        <p style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', margin: 0 }}>
          {step === 'create' && 'Choisis un code à 4 chiffres'}
          {step === 'confirm' && 'Entre-le une seconde fois'}
          {step === 'done' && 'Bienvenue dans Notre Bulle'}
        </p>
      </motion.div>

      {/* Step Indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        {(['create', 'confirm', 'done'] as const).map((s) => {
          const order: SetupStep[] = ['create', 'confirm', 'done'];
          const currentIdx = order.indexOf(step);
          const stepIdx = order.indexOf(s);
          const isActive = s === step;
          const isPast = stepIdx < currentIdx;
          return (
            <div
              key={s}
              style={{
                width: isActive ? 28 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: isPast ? colors.success : isActive ? colors.primary : colors.border,
                transition: 'all 0.3s ease',
              }}
            />
          );
        })}
      </div>

      {/* PIN Input */}
      {(step === 'create' || step === 'confirm') && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              key={shakeKey}
              animate={isError ? { x: [0, -10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', gap: 16, marginBottom: 12, height: 16, alignItems: 'center' }}
            >
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 14, height: 14, borderRadius: 7,
                    backgroundColor: isError
                      ? colors.error
                      : i < currentStepDots.length
                        ? colors.primary
                        : colors.border,
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </motion.div>
          </motion.div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
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
                        width: KEY_SIZE, height: KEY_SIZE,
                        borderRadius: borderRadius.lg,
                        backgroundColor: colors.surface,
                        border: 'none', cursor: 'pointer',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        boxShadow: `0 2px 8px ${colors.shadow}`,
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
          </div>

          {isError && (
            <p style={{ color: colors.error, fontSize: 14, marginTop: 8 }}>
              {errorMsg}
            </p>
          )}
        </>
      )}

      {/* Done */}
      {step === 'done' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.2 }}
          style={{ width: '100%', maxWidth: 400, marginTop: 40 }}
        >
          <button
            onClick={goToChat}
            style={{
              width: '100%',
              padding: `${spacing.lg}px 0`,
              borderRadius: borderRadius.lg,
              border: 'none', cursor: 'pointer',
              backgroundColor: colors.primary,
              color: '#FAFAF9', fontSize: 18, fontWeight: 600,
              fontFamily: 'inherit',
              boxShadow: `0 4px 12px ${colors.glowBurgundy}`,
            }}
          >
            Commencer l'aventure
          </button>
        </motion.div>
      )}
    </div>
  );
}
