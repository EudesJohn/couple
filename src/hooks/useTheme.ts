// ============================================================
// Hook — Thème dynamique (chargé depuis SecureStore)
// Permet aux composants de réagir au changement de thème
// ============================================================
import { useState, useEffect } from 'react';
import { getTheme, type ChatTheme } from '../lib/settings';
import { colors as defaultColors } from '../constants/theme';

export function useTheme() {
  const [chatTheme, setChatTheme] = useState<ChatTheme | null>(null);

  // Recharger le thème à chaque montée
  const refresh = async () => {
    const theme = await getTheme();
    setChatTheme(theme);
  };

  useEffect(() => { refresh(); }, []);

  return {
    chatTheme,
    bubbleSelf: chatTheme?.bubbleSelf ?? defaultColors.bubbleSelf,
    bubbleOther: chatTheme?.bubbleOther ?? defaultColors.bubbleOther,
    bg: chatTheme?.bg ?? defaultColors.background,
    backgroundImage: chatTheme?.backgroundImage ?? null,
    refresh,
  };
}
