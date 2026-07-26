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

  const refresh = useCallback(async () => {
    const theme = await getTheme();
    setChatTheme(theme);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
      downloadMedia(bg)
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
