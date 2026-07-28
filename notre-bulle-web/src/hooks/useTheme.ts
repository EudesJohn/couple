// ============================================================
// Hook — Thème dynamique (chargé depuis localStorage)
// Permet aux composants de réagir au changement de thème
//
// Le fond d'écran est stocké comme chemin Storage et résolu
// via downloadMedia() en blob URL pour l'affichage
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { getTheme, type ChatTheme } from '../lib/settings';
import { downloadMedia } from '../lib/media';
import { colors as defaultColors } from '../constants/theme';

export function useTheme() {
  const [chatTheme, setChatTheme] = useState<ChatTheme | null>(null);
  const [bgSrc, setBgSrc] = useState<string | null>(null);
  const bgBlobRef = useRef<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // incrémenté pour forcer le rechargement

  const refresh = useCallback(async () => {
    const theme = await getTheme();
    setChatTheme(theme);
  }, []);

  // Chargement initial + réaction aux changements localStorage (même onglet)
  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  // Écouter les changements localStorage (autre onglet / custom event)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'notre-bulle.theme') {
        setRefreshKey((k) => k + 1);
      }
    };
    const onThemeChange = () => {
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('notre-bulle:theme-changed', onThemeChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('notre-bulle:theme-changed', onThemeChange);
    };
  }, []);

  // Résoudre le fond d'écran : si c'est un chemin Storage, télécharger via
  // downloadMedia() et créer une blob URL. Si c'est une URL legacy, l'utiliser.
  useEffect(() => {
    let cancelled = false;

    // Nettoyer la précédente blob URL
    if (bgBlobRef.current) {
      URL.revokeObjectURL(bgBlobRef.current);
      bgBlobRef.current = null;
    }
    setBgSrc(null);

    const bg = chatTheme?.backgroundImage;
    if (!bg) return;

    if (bg.startsWith('MEDIA/') || bg.startsWith('VOICE_NOTES/') || bg.startsWith('THUMBNAILS/')) {
      // Cache-bust uniquement pour le fond d'écran (chemin fixe écrasé par upsert)
      downloadMedia(bg, { cacheBust: true })
        .then(blob => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          bgBlobRef.current = url;
          setBgSrc(url);
        })
        .catch(() => { if (!cancelled) setBgSrc(null); });
    } else {
      // Legacy URL publique
      setBgSrc(bg);
    }

    return () => { cancelled = true; };
  }, [chatTheme?.backgroundImage]);

  return {
    chatTheme,
    bubbleSelf: chatTheme?.bubbleSelf ?? defaultColors.bubbleSelf,
    bubbleOther: chatTheme?.bubbleOther ?? defaultColors.bubbleOther,
    bg: chatTheme?.bg ?? defaultColors.background,
    // bgSrc = blob URL résolue, null tant que pas prêt (évite d'injecter un chemin Storage brut dans CSS)
    backgroundImage: bgSrc ?? (chatTheme?.backgroundImage?.startsWith('http') ? chatTheme.backgroundImage : null),
    refresh,
  };
}
