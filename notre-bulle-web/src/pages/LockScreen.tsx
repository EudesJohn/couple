// ============================================================
// 🔐 Écran de Verrouillage — Design Premium Burgundy & Gold
// 1ʳᵉ connexion : confirmation du profil par UUID → puis code PIN
// Connexions suivantes : saisie du PIN (fenêtre de 24 h)
// ============================================================
import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius, fonts } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { config } from '../constants/config';
import { HeartFilledIcon, UserIcon, UsersIcon, EditIcon } from '../components/Icons';

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
// 👫 Choix du profil — « Je suis Elle / Je suis Lui »
// Les deux cartes mappent sur les UUID configurés (VITE_MY_PROFILE_ID
// = la femme, VITE_PARTNER_PROFILE_ID = l'homme). L'UUID reste
// accessible en fallback via le lien « Saisir mon UUID ».
// ==========================================
function ProfilePick({
  onPick,
  verifying,
  error,
  onShowUuid,
}: {
  onPick: (role: 'woman' | 'man') => void;
  verifying: boolean;
  error: string;
  onShowUuid: () => void;
}) {
  const [profiles, setProfiles] = useState<{
    woman: { name: string; avatar: string | null } | null;
    man: { name: string; avatar: string | null } | null;
  }>({ woman: null, man: null });

  useEffect(() => {
    const ids = [config.myProfileId, config.partnerProfileId].filter(Boolean);
    if (ids.length === 0) return;
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', ids)
      .then(({ data }: { data: { id: string; display_name: string; avatar_url: string | null }[] | null }) => {
        if (!data) return;
        const woman = data.find((p) => p.id === config.myProfileId) ?? null;
        const man = data.find((p) => p.id === config.partnerProfileId) ?? null;
        setProfiles({
          woman: woman ? { name: woman.display_name, avatar: woman.avatar_url } : null,
          man: man ? { name: man.display_name, avatar: man.avatar_url } : null,
        });
      })
      .catch(() => {});
  }, []);

  const renderCard = (role: 'woman' | 'man', label: string) => {
    const profile = profiles[role];
    const uuid = role === 'woman' ? config.myProfileId : config.partnerProfileId;
    if (!uuid) return null;

    return (
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => onPick(role)}
        disabled={verifying}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: spacing.lg,
          backgroundColor: colors.surface,
          border: `1.5px solid ${colors.border}`,
          borderRadius: borderRadius.xl,
          padding: `${spacing.lg}px ${spacing.xl}px`,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          opacity: verifying ? 0.6 : 1,
          transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = colors.accent;
          (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 16px ${colors.shadowStrong}`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = colors.border;
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: role === 'woman' ? colors.glowBurgundy : colors.surfaceAlt2,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          flexShrink: 0, overflow: 'hidden',
        }}>
          {profile?.avatar ? (
            <img src={profile.avatar} alt={label} style={{ width: 56, height: 56, objectFit: 'cover' }} />
          ) : (
            <UserIcon size={26} color={role === 'woman' ? colors.primary : colors.accentDark} />
          )}
        </div>

        {/* Texte */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: colors.text, marginBottom: 2 }}>
            {profile?.name || label}
          </div>
          <div style={{ fontSize: 13, color: colors.textTertiary }}>
            {role === 'woman' ? 'Je suis elle' : 'Je suis lui'}
          </div>
        </div>

        {/* Pastille de sélection */}
        <div style={{
          width: 26, height: 26, borderRadius: 13,
          border: `2px solid ${colors.border}`,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: 'transparent' }} />
        </div>
      </motion.button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.6 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', maxWidth: 360, position: 'relative', zIndex: 1,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: spacing.sm,
        marginBottom: spacing.sm,
      }}>
        <UsersIcon size={18} color={colors.accent} />
        <p style={{
          fontSize: 15, color: colors.textSecondary,
          margin: 0, textAlign: 'center',
        }}>
          Qui es-tu ?
        </p>
      </div>

      <p style={{
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: '22px',
        margin: 0, marginBottom: 20,
      }}>
        Choisis ton profil pour rejoindre votre bulle
      </p>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {renderCard('woman', 'Elle')}
        {renderCard('man', 'Lui')}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: 13, color: colors.error, marginTop: 14, textAlign: 'center' }}
        >
          {error}
        </motion.p>
      )}

      <button
        onClick={onShowUuid}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', marginTop: spacing.lg,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <EditIcon size={13} color={colors.textTertiary} />
        <span style={{ fontSize: 13, color: colors.textTertiary, fontStyle: 'italic' }}>
          Saisir mon UUID manuellement
        </span>
      </button>
    </motion.div>
  );
}

// ==========================================
// 🏷️ Confirmation du profil par UUID (onboarding)
// ==========================================
function ProfileConfirm({
  onVerify,
  verifying,
  error,
}: {
  onVerify: (uuid: string) => void;
  verifying: boolean;
  error: string;
}) {
  const [value, setValue] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.6 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', maxWidth: 360, position: 'relative', zIndex: 1,
      }}
    >
      <p style={{
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: '22px',
        margin: 0, marginBottom: 20,
      }}>
        Entre l’UUID de ton profil pour continuer
      </p>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="UUID du profil…"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !verifying) onVerify(value);
        }}
        style={{
          width: '100%',
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: `${spacing.lg}px ${spacing.xl}px`,
          fontSize: 15,
          color: colors.text,
          border: `1.5px solid ${error ? colors.error : colors.border}`,
          outline: 'none',
          fontFamily: 'monospace',
          letterSpacing: 0.5,
          marginBottom: 14,
          transition: 'border-color 0.2s ease',
        }}
      />

      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => onVerify(value)}
        disabled={verifying}
        style={{
          width: '100%',
          backgroundColor: colors.primary,
          borderRadius: borderRadius.lg,
          padding: `${spacing.md}px 0`,
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          opacity: verifying ? 0.6 : 1,
        }}
      >
        <span style={{ color: '#FAFAF9', fontWeight: 600, fontSize: 16 }}>
          {verifying ? 'Vérification…' : 'Vérifier'}
        </span>
      </motion.button>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            fontSize: 13, color: colors.error, marginTop: 14,
            textAlign: 'center',
          }}
        >
          {error}
        </motion.p>
      )}

      <p style={{
        fontSize: 12, color: colors.textTertiary, marginTop: 18,
        textAlign: 'center', fontStyle: 'italic', lineHeight: '17px',
      }}>
        L’UUID de ton profil se trouve dans la configuration de l’app
        (VITE_MY_PROFILE_ID / VITE_PARTNER_PROFILE_ID)
      </p>
    </motion.div>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function LockScreen() {
  const { status, confirmProfile, setPin, unlockWithPin, authError, clearAuthError, switchProfile } = useAuth();

  // Saisie PIN (setup + déverrouillage)
  const [pin, setPinValue] = useState('');
  const [setupPhase, setSetupPhase] = useState<'choose' | 'confirm'>('choose');
  const [pendingPin, setPendingPin] = useState<string | null>(null);

  // Erreurs / états
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);

  // Confirmation du profil
  const [verifying, setVerifying] = useState(false);
  const [uuidError, setUuidError] = useState('');
  // Par défaut : cartes « Elle / Lui ». Si aucun ID n'est configuré
  // (env vide), on bascule directement sur la saisie UUID brute.
  const hasConfiguredProfiles = Boolean(config.myProfileId || config.partnerProfileId);
  const [showUuidInput, setShowUuidInput] = useState(!hasConfiguredProfiles);

  const handleVerifyProfile = useCallback(async (uuid: string) => {
    if (verifying) return;
    setUuidError('');
    setVerifying(true);
    const res = await confirmProfile(uuid);
    setVerifying(false);
    if (!res.ok) setUuidError(res.error || 'Erreur inconnue');
    // Succès → le statut passe à 'setupPin', le composant se ré-affiche
  }, [verifying, confirmProfile]);

  const handlePickRole = useCallback((role: 'woman' | 'man') => {
    const uuid = role === 'woman' ? config.myProfileId : config.partnerProfileId;
    if (uuid) handleVerifyProfile(uuid);
  }, [handleVerifyProfile]);

  const resetSetupPin = useCallback(() => {
    setPinValue('');
    setPendingPin(null);
    setSetupPhase('choose');
  }, []);

  const handleKeyPress = useCallback(async (key: string) => {
    if (key === '⌫') {
      setPinValue((prev) => prev.slice(0, -1));
      setIsError(false);
      setErrorMsg('');
      return;
    }
    // Une nouvelle saisie efface une éventuelle erreur réseau précédente
    clearAuthError();
    if (key === '' || pin.length >= PIN_LENGTH) return;

    const newPin = pin + key;
    setPinValue(newPin);
    if (newPin.length !== PIN_LENGTH) return;

    if (status === 'locked') {
      // --- DÉVERROUILLAGE : vérification du PIN hashé ---
      const valid = await unlockWithPin(newPin);
      if (valid) {
        // Succès → statut 'unlocked' → RootRoute redirige vers /chat
      } else {
        setAttempts((a) => a + 1);
        setIsError(true);
        // Une erreur réseau (serveur injoignable) prime sur « Code incorrect »
        setErrorMsg(authError || 'Code incorrect');
        setShakeKey((k) => k + 1);
        setTimeout(() => setPinValue(''), 400);
        setTimeout(() => setIsError(false), 500);
      }
    } else if (status === 'setupPin') {
      // --- CHOIX DU PIN (1ʳᵉ connexion) ---
      if (setupPhase === 'choose') {
        setPendingPin(newPin);
        setPinValue('');
        setSetupPhase('confirm');
      } else if (setupPhase === 'confirm') {
        if (newPin === pendingPin) {
          const ok = await setPin(newPin);
          if (!ok) {
            setIsError(true);
            setErrorMsg('Erreur lors de l’enregistrement');
            setShakeKey((k) => k + 1);
            setTimeout(resetSetupPin, 1200);
          }
          // Succès → statut 'unlocked' → RootRoute redirige vers /chat
        } else {
          setIsError(true);
          setErrorMsg('Les codes ne correspondent pas');
          setShakeKey((k) => k + 1);
          setTimeout(() => setPinValue(''), 400);
          setTimeout(() => {
            setIsError(false);
            resetSetupPin();
          }, 1200);
        }
      }
    }
  }, [pin, status, setupPhase, pendingPin, unlockWithPin, setPin, resetSetupPin, authError, clearAuthError]);

  const KEY_SIZE = Math.min((window.innerWidth - 64 - 40) / 3, 100);
  const isSetup = status === 'setupPin';
  const isOnboarding = status === 'onboarding';

  // Sous-titre du branding selon l'étape
  let subtitle: string;
  if (isOnboarding) subtitle = 'Première connexion · confirme ton profil';
  else if (isSetup) subtitle = setupPhase === 'choose' ? 'Choisis ton code à 4 chiffres' : 'Confirme ton code';
  else subtitle = 'Déverrouille pour nous rejoindre';

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
          marginBottom: 40,
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
          fontSize: 16,
          fontStyle: 'italic',
          color: colors.textSecondary,
          textAlign: 'center',
          margin: 0,
        }}>
          {subtitle}
        </p>
      </motion.div>

      {isOnboarding ? (
        /* ── CONFIRMATION DU PROFIL ──
           Par défaut : cartes « Elle / Lui » (plus friendly).
           L'UUID brut reste disponible via le lien dédié. */
        showUuidInput ? (
          <ProfileConfirm
            onVerify={handleVerifyProfile}
            verifying={verifying}
            error={uuidError}
          />
        ) : (
          <ProfilePick
            onPick={handlePickRole}
            verifying={verifying}
            error={uuidError}
            onShowUuid={() => { setUuidError(''); setShowUuidInput(true); }}
          />
        )
      ) : (
        <>
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
                      transition: 'background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
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
                      whileTap={{ scale: 0.96 }}
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
                        boxShadow: key === '⌫' ? 'none' : `0 1px 4px rgba(0,0,0,0.05)`,
                        fontFamily: 'inherit',
                        transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 160ms ease',
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
        </>
      )}

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

      {/* Erreur réseau (serveur injoignable, déconnexion forcée…) */}
      {authError && !errorMsg && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            fontSize: 13,
            color: colors.error,
            marginTop: spacing.lg,
            textAlign: 'center',
          }}
        >
          {authError}
        </motion.p>
      )}

      {/* Tentatives (mode déverrouillage uniquement) */}
      {!isSetup && !isOnboarding && attempts > 0 && !errorMsg && (
        <p style={{
          fontSize: 13, color: colors.error, marginTop: spacing.lg,
        }}>
          Code incorrect · {3 - Math.min(attempts, 3)} tentative{3 - Math.min(attempts, 3) > 1 ? 's' : ''} restante{3 - Math.min(attempts, 3) <= 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
