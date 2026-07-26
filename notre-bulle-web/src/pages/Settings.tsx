// ============================================================
// Paramètres premium — Pseudo, PIN, thème, fond d'écran
// Design Burgundy & Gold, Framer Motion
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { hashPin, savePinHash, verifyPin, getStoredPinHash } from '../lib/auth';
import { getTheme, saveTheme, saveBackgroundImage, removeBackgroundImage, getBackgroundImage, type ChatTheme } from '../lib/settings';
import { compressImage, downloadMedia } from '../lib/media';
import { config } from '../constants/config';
import {
  BackIcon, SettingsIcon, HeartFilledIcon, UserIcon, LockIcon,
  EditIcon, CameraIcon, CheckIcon, CloseIcon, ImageIcon,
} from '../components/Icons';
import { PremiumAlert } from '../components/PremiumAlert';

const THEMES: (ChatTheme & { name: string })[] = [
  { name: 'Rose', bg: '#FAF6F9', bubbleSelf: '#E8A0B4', bubbleOther: '#F0EBF3' },
  { name: 'Lavande', bg: '#F8F4FC', bubbleSelf: '#B8A9C9', bubbleOther: '#EDE8F3' },
  { name: 'Peche', bg: '#FEF8F4', bubbleSelf: '#F4C7AB', bubbleOther: '#F5EDE8' },
  { name: 'Ocean', bg: '#F0F7FA', bubbleSelf: '#7BC4E8', bubbleOther: '#E8F0F5' },
  { name: 'Foret', bg: '#F4F9F4', bubbleSelf: '#7BC4A9', bubbleOther: '#E8F3ED' },
  { name: 'Nuit', bg: '#1A1120', bubbleSelf: '#E8A0B4', bubbleOther: '#2D1B36' },
];

// ==========================================
// TOAST DE FEEDBACK
// ==========================================
function ToastFeedback({ message, visible }: { message: string; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.8 }}
          transition={{ type: 'spring', damping: 14, stiffness: 180 }}
          style={{
            display: 'flex', alignItems: 'center', gap: spacing.sm,
            backgroundColor: colors.success,
            padding: `${spacing.md}px ${spacing.xl}px`,
            borderRadius: 999,
            boxShadow: `0 4px 12px ${colors.success}66`,
          }}
        >
          <CheckIcon size={16} color="#FAFAF9" />
          <span style={{ color: '#FAFAF9', fontSize: 14, fontWeight: 600 }}>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ==========================================
// NKEY — Touche du clavier PIN
// ==========================================
function PinKey({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onMouseDown={onPress}
      style={{
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: colors.surfaceAlt, border: 'none', cursor: 'pointer',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: 24, fontWeight: 500, color: colors.text }}>{label}</span>
    </motion.button>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function SettingsScreen() {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null); // blob URL pour l'affichage
  const [selectedTheme, setSelectedTheme] = useState(0);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgSrc, setBgSrc] = useState<string | null>(null); // blob URL pour l'affichage

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingPseudo, setSavingPseudo] = useState(false);
  const [applyingTheme, setApplyingTheme] = useState(false);

  // Premium Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({ type: 'info', title: '', message: '' });

  const showAlert = useCallback((type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ type, title, message });
    setAlertVisible(true);
  }, []);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2200);
  }, []);

  // PIN
  const [showPinChange, setShowPinChange] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'old' | 'new' | 'confirm'>('old');
  const [pinError, setPinError] = useState('');

  // Get profile ID (pas de session Supabase, on utilise la config)
  const getUserId = useCallback(async (): Promise<string | null> => {
    return config.myProfileId ?? null;
  }, []);

  // Load profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await getUserId();
      if (!userId) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (profile) {
        setDisplayName(profile.display_name);
        setNewDisplayName(profile.display_name);
        // Charger l'avatar via downloadMedia (contourne le bucket privé)
        if (profile.avatar_url) {
          setAvatar(profile.avatar_url);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [getUserId]);

  // Charger l'image de l'avatar via downloadMedia (contourne le bucket privé)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAvatarSrc(null);
      if (!avatar) return;
      // Si c'est un chemin Storage, télécharger via l'API
      if (avatar.startsWith('MEDIA/') || avatar.startsWith('VOICE_NOTES/') || avatar.startsWith('THUMBNAILS/')) {
        try {
          const blob = await downloadMedia(avatar);
          if (!cancelled) setAvatarSrc(URL.createObjectURL(blob));
        } catch {
          if (!cancelled) setAvatarSrc(null);
        }
      } else {
        // Legacy URL publique
        if (!cancelled) setAvatarSrc(avatar);
      }
    })();
    return () => { cancelled = true; };
  }, [avatar]);

  // Charger le fond d'écran au montage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bg = await getBackgroundImage();
      if (cancelled || !bg) return;
      setBgPreview(bg);
      if (bg.startsWith('MEDIA/') || bg.startsWith('VOICE_NOTES/') || bg.startsWith('THUMBNAILS/')) {
        try {
          const blob = await downloadMedia(bg);
          if (!cancelled) setBgSrc(URL.createObjectURL(blob));
        } catch { /* silencieux */ }
      } else {
        if (!cancelled) setBgSrc(bg);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load current theme from localStorage
  useEffect(() => {
    (async () => {
      const theme = await getTheme();
      const idx = THEMES.findIndex(
        t => t.bg === theme.bg && t.bubbleSelf === theme.bubbleSelf && t.bubbleOther === theme.bubbleOther
      );
      if (idx >= 0) setSelectedTheme(idx);
    })();
  }, []);

  // Save display name
  const saveDisplayName = useCallback(async () => {
    if (!newDisplayName.trim()) {
      showAlert('error', 'Pseudo vide', 'Le pseudo ne peut pas être vide');
      return;
    }
    if (savingPseudo) return;
    setSavingPseudo(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        showAlert('error', 'Connexion', 'Tu dois être connecté pour changer ton pseudo');
        setSavingPseudo(false);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: newDisplayName.trim() })
        .eq('id', userId);
      if (error) throw error;
      setDisplayName(newDisplayName.trim());
      showToast('Pseudo modifié');
    } catch (err: any) {
      showAlert('error', 'Erreur', err?.message || 'Impossible de modifier le pseudo');
    } finally { setSavingPseudo(false); }
  }, [newDisplayName, getUserId, showToast, showAlert, savingPseudo]);

  // PIN handler
  const handlePinKey = useCallback(async (key: string) => {
    if (key === '⌫') {
      if (pinStep === 'old') setOldPin(p => p.slice(0, -1));
      if (pinStep === 'new') setNewPin(p => p.slice(0, -1));
      if (pinStep === 'confirm') setConfirmPin(p => p.slice(0, -1));
      setPinError('');
      return;
    }

    if (pinStep === 'old' && oldPin.length < 4) {
      const newVal = oldPin + key;
      setOldPin(newVal);
      if (newVal.length === 4) {
        const storedHash = await getStoredPinHash();
        const valid = storedHash ? await verifyPin(newVal, storedHash) : false;
        if (valid) {
          setOldPin('');
          setPinStep('new');
        } else {
          setPinError('Ancien code incorrect');
          setTimeout(() => setOldPin(''), 400);
        }
      }
    } else if (pinStep === 'new' && newPin.length < 4) {
      const newVal = newPin + key;
      setNewPin(newVal);
      if (newVal.length === 4) {
        setPinStep('confirm');
      }
    } else if (pinStep === 'confirm' && confirmPin.length < 4) {
      const newVal = confirmPin + key;
      setConfirmPin(newVal);
      if (newVal.length === 4) {
        if (newVal === newPin) {
          const hash = await hashPin(newVal);
          await savePinHash(hash);
          showToast('Code PIN modifié');
          setShowPinChange(false);
          setOldPin('');
          setNewPin('');
          setConfirmPin('');
          setPinStep('old');
        } else {
          setPinError('Les codes ne correspondent pas');
          setTimeout(() => setConfirmPin(''), 400);
        }
      }
    }
  }, [pinStep, oldPin, newPin, confirmPin, showToast]);

  // Upload image to Supabase — stocke le chemin, pas l'URL publique
  const uploadImageToStorage = useCallback(async (
    userId: string, uri: string, folder: 'avatars' | 'backgrounds'
  ): Promise<string> => {
    const fileName = `${userId}.jpg`;
    // Chemin avec préfixe MEDIA/ (comme uploadMedia dans media.ts)
    const filePath = `MEDIA/${folder}/${fileName}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;
    // Retourne le chemin Storage, pas une URL publique
    return filePath;
  }, []);

  // Select photo using file input
  const handleSelectPhoto = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setPhotoPreview(URL.createObjectURL(file));
      }
    };
    input.click();
  }, []);

  // Confirm photo
  const handleConfirmPhoto = useCallback(async () => {
    if (!photoPreview || uploading) return;
    setUploading(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        showAlert('error', 'Connexion', 'Tu dois être connecté à Supabase');
        setUploading(false);
        return;
      }
      const compressedUri = await compressImage(photoPreview);
      const storagePath = await uploadImageToStorage(userId, compressedUri, 'avatars');
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: storagePath })
        .eq('id', userId);
      if (updateError) throw updateError;
      setAvatar(storagePath);
      setPhotoPreview(null);
      showToast('Photo mise à jour');
    } catch (err: any) {
      showAlert('error', 'Erreur', err?.message || 'Impossible de changer la photo');
    } finally { setUploading(false); }
  }, [photoPreview, getUserId, uploadImageToStorage, showToast, showAlert, uploading]);

  const handleCancelPhoto = useCallback(() => { setPhotoPreview(null); }, []);

  // Pick background
  const handlePickBackground = useCallback(async () => {
    if (uploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const uri = URL.createObjectURL(file);
      setUploading(true);
      try {
        const userId = await getUserId();
        if (!userId) {
          showAlert('error', 'Connexion', 'Tu dois être connecté');
          setUploading(false);
          return;
        }
        const compressedUri = await compressImage(uri);
        const storagePath = await uploadImageToStorage(userId, compressedUri, 'backgrounds');
        await saveBackgroundImage(storagePath);
        setBgPreview(storagePath);
        // Charger le blob pour l'affichage
        try {
          const blob = await downloadMedia(storagePath);
          setBgSrc(URL.createObjectURL(blob));
        } catch {
          setBgSrc(null);
        }
        showToast('Fond d\'écran appliqué');
      } catch (err: any) {
        showAlert('error', 'Erreur', err?.message || 'Impossible de changer le fond');
      } finally { setUploading(false); }
    };
    input.click();
  }, [getUserId, uploadImageToStorage, showToast, showAlert, uploading]);

  const handleRemoveBackground = useCallback(async () => {
    await removeBackgroundImage();
    setBgPreview(null);
    setBgSrc(null);
    showToast('Fond d\'écran retiré');
  }, [showToast]);

  const pinDots = pinStep === 'old' ? oldPin : pinStep === 'new' ? newPin : confirmPin;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      backgroundColor: colors.background,
    }}>
      {/* Header premium */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `12px ${spacing.lg}px`,
        backgroundColor: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: colors.surfaceAlt, border: 'none', cursor: 'pointer',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
          }}
        >
          <BackIcon size={20} color={colors.primary} />
        </motion.button>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <SettingsIcon size={18} color={colors.text} />
          <span style={{ fontSize: 17, fontWeight: 600, color: colors.text }}>Paramètres</span>
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${spacing.lg}px`, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* --- Photo de profil --- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 120, delay: 0 }}
          style={{
            backgroundColor: colors.surface,
            borderRadius: borderRadius.xl,
            padding: spacing.xl,
            boxShadow: `0 2px 10px ${colors.shadow}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
            <UserIcon size={15} color={colors.primary} />
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Photo de profil
            </span>
          </div>

          {photoPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.md }}>
              <img
                src={photoPreview}
                alt="Aperçu"
                style={{
                  width: 120, height: 120, borderRadius: 60,
                  border: `2px solid ${colors.border}`, objectFit: 'cover',
                }}
              />
              <div style={{ display: 'flex', gap: spacing.lg }}>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCancelPhoto}
                  disabled={uploading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: `${spacing.md}px ${spacing.xl}px`,
                    borderRadius: 999, backgroundColor: colors.surfaceAlt,
                    border: `1px solid ${colors.border}`, cursor: 'pointer',
                    fontFamily: 'inherit',
                    opacity: uploading ? 0.5 : 1,
                  }}
                >
                  <CloseIcon size={16} color={colors.error} />
                  <span style={{ color: colors.error, fontWeight: 500, fontSize: 14 }}>Annuler</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleConfirmPhoto}
                  disabled={uploading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: `${spacing.md}px ${spacing.xl}px`,
                    borderRadius: 999, backgroundColor: colors.primary,
                    border: 'none', cursor: 'pointer', minWidth: 100,
                    justifyContent: 'center', fontFamily: 'inherit',
                    opacity: uploading ? 0.5 : 1,
                  }}
                >
                  {uploading ? (
                    <span style={{ color: '#FAFAF9', fontSize: 14 }}>Chargement…</span>
                  ) : (
                    <>
                      <CheckIcon size={16} color="#FAFAF9" />
                      <span style={{ color: '#FAFAF9', fontWeight: 600, fontSize: 14 }}>Valider</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${spacing.sm}px 0` }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSelectPhoto}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{
                  width: 100, height: 100, borderRadius: 50,
                  border: `2.5px solid ${colors.primary}30`,
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  marginBottom: spacing.sm,
                }}>
                  <div style={{
                    width: 86, height: 86, borderRadius: 43,
                    backgroundColor: colors.surfaceAlt,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    overflow: 'hidden',
                  }}>
                    {avatar ? (
                      <img src={avatarSrc || undefined} alt="Avatar" style={{ width: 86, height: 86, borderRadius: 43, objectFit: 'cover' }} />
                    ) : (
                      <HeartFilledIcon size={36} color={colors.accent} />
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CameraIcon size={14} color={colors.primary} />
                  <span style={{ color: colors.primary, fontWeight: 500, fontSize: 14 }}>Changer la photo</span>
                </div>
              </motion.button>
            </div>
          )}
        </motion.div>

        {/* --- Pseudo --- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 120, delay: 0.06 }}
          style={{
            backgroundColor: colors.surface,
            borderRadius: borderRadius.xl,
            padding: spacing.xl,
            boxShadow: `0 2px 10px ${colors.shadow}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
            <EditIcon size={15} color={colors.primary} />
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Pseudo
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Ton pseudo"
              maxLength={30}
              disabled={savingPseudo}
              style={{
                flex: 1,
                backgroundColor: colors.surfaceAlt,
                borderRadius: borderRadius.md,
                padding: `${spacing.md}px ${spacing.lg}px`,
                fontSize: 16, color: colors.text,
                border: 'none', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={saveDisplayName}
              disabled={savingPseudo}
              style={{
                backgroundColor: colors.primary,
                borderRadius: borderRadius.md,
                padding: `${spacing.md}px ${spacing.xl}px`,
                border: 'none', cursor: 'pointer', minWidth: 72,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
                opacity: savingPseudo ? 0.5 : 1,
              }}
            >
              <span style={{ color: '#FAFAF9', fontWeight: 600, fontSize: 14 }}>
                {savingPseudo ? '…' : 'Sauver'}
              </span>
            </motion.button>
          </div>
        </motion.div>

        {/* --- Code PIN --- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 120, delay: 0.12 }}
          style={{
            backgroundColor: colors.surface,
            borderRadius: borderRadius.xl,
            padding: spacing.xl,
            boxShadow: `0 2px 10px ${colors.shadow}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
            <LockIcon size={15} color={colors.primary} />
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Code secret
            </span>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowPinChange(!showPinChange)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
            }}
          >
            <span style={{ color: colors.primary, fontWeight: 500 }}>
              {showPinChange ? 'Annuler' : 'Changer le code PIN'}
            </span>
          </motion.button>

          <AnimatePresence>
            {showPinChange && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: spacing.lg, gap: spacing.md, overflow: 'hidden' }}
              >
                <span style={{ fontSize: 15, color: colors.text }}>
                  {pinStep === 'old' && 'Entre ton code actuel'}
                  {pinStep === 'new' && 'Nouveau code à 4 chiffres'}
                  {pinStep === 'confirm' && 'Confirme le nouveau code'}
                </span>

                <div style={{ display: 'flex', gap: 12 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{
                      width: 14, height: 14, borderRadius: 7,
                      backgroundColor: i < pinDots.length ? colors.primary : colors.border,
                      transition: 'background-color 0.2s',
                    }} />
                  ))}
                </div>

                {pinError && <span style={{ color: colors.error, fontSize: 13 }}>{pinError}</span>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']].map((row, ri) => (
                    <div key={ri} style={{ display: 'flex', gap: 16 }}>
                      {row.map((k) =>
                        k === '' ? <div key="e" style={{ width: 64, height: 64 }} /> :
                        <PinKey key={k} label={k} onPress={() => handlePinKey(k)} />
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* --- Thème --- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 120, delay: 0.18 }}
          style={{
            backgroundColor: colors.surface,
            borderRadius: borderRadius.xl,
            padding: spacing.xl,
            boxShadow: `0 2px 10px ${colors.shadow}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
            <HeartFilledIcon size={15} color={colors.primary} />
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Thème
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {THEMES.map((theme, i) => {
              const isSelected = selectedTheme === i;
              return (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    if (applyingTheme) return;
                    setApplyingTheme(true);
                    setSelectedTheme(i);
                    await saveTheme({ bg: theme.bg, bubbleSelf: theme.bubbleSelf, bubbleOther: theme.bubbleOther });
                    setApplyingTheme(false);
                    showToast('Thème appliqué');
                  }}
                  style={{
                    borderRadius: borderRadius.lg,
                    padding: spacing.md,
                    border: `2px solid ${isSelected ? colors.primary : 'transparent'}`,
                    backgroundColor: theme.bg,
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    position: 'relative',
                    width: 'calc(50% - 5px)',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{
                      width: 44, height: 18, borderRadius: 9,
                      backgroundColor: theme.bubbleSelf,
                      alignSelf: 'flex-end',
                    }} />
                    <div style={{
                      width: 44, height: 18, borderRadius: 9,
                      backgroundColor: theme.bubbleOther,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 500,
                    color: theme.name === 'Nuit' ? '#FAFAF9' : colors.text,
                  }}>
                    {theme.name}
                  </span>
                  {isSelected && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: colors.primary,
                      display: 'flex', justifyContent: 'center', alignItems: 'center',
                    }}>
                      <CheckIcon size={12} color="#FAFAF9" />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* --- Fond d'écran --- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 120, delay: 0.24 }}
          style={{
            backgroundColor: colors.surface,
            borderRadius: borderRadius.xl,
            padding: spacing.xl,
            boxShadow: `0 2px 10px ${colors.shadow}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
            <ImageIcon size={15} color={colors.primary} />
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Fond d'écran
            </span>
          </div>

          {bgPreview && (
            <div style={{ marginBottom: spacing.md, borderRadius: borderRadius.md, overflow: 'hidden' }}>
              <img src={bgSrc || bgPreview || undefined} alt="Aperçu fond" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: borderRadius.md }} />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleRemoveBackground}
                disabled={uploading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: `${spacing.sm}px 0`, marginTop: spacing.sm,
                  background: 'none', border: 'none', cursor: 'pointer', width: '100%',
                  fontFamily: 'inherit',
                  opacity: uploading ? 0.5 : 1,
                }}
              >
                <CloseIcon size={14} color={colors.error} />
                <span style={{ color: colors.error, fontWeight: 500 }}>Enlever</span>
              </motion.button>
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={bgPreview ? handleRemoveBackground : handlePickBackground}
            disabled={uploading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              backgroundColor: colors.surfaceAlt, padding: `${spacing.md}px 0`,
              borderRadius: borderRadius.md,
              border: `1.5px dashed ${colors.border}`,
              cursor: 'pointer', width: '100%',
              fontFamily: 'inherit',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {uploading ? (
              <span style={{ color: colors.primary, fontWeight: 600 }}>Chargement…</span>
            ) : (
              <>
                <ImageIcon size={18} color={colors.primary} />
                <span style={{ color: colors.primary, fontWeight: 600 }}>
                  {bgPreview ? 'Changer la photo' : 'Choisir une photo'}
                </span>
              </>
            )}
          </motion.button>

          {!bgPreview && (
            <p style={{
              fontSize: 12, color: colors.textTertiary,
              textAlign: 'center', marginTop: spacing.sm, fontStyle: 'italic',
            }}>
              Photo personnelle en arrière-plan de votre discussion
            </p>
          )}
        </motion.div>

        <div style={{ height: 40 }} />
      </div>

      {/* Premium Alert */}
      <PremiumAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertVisible(false)}
      />

      {/* Toast */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 100,
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 100,
      }}>
        <ToastFeedback message={toastMsg} visible={toastVisible} />
      </div>
    </div>
  );
}
