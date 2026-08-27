// ============================================================
// Settings — stockage des préférences (thème, fond, etc.)
// Utilise expo-secure-store (natif) / localStorage (web)
// ============================================================
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

async function get(key: string): Promise<string | null> {
  if (isWeb) return localStorage.getItem(key);
  try {
    const SecureStore = await import('expo-secure-store');
    return await SecureStore.default.getItemAsync(key);
  } catch { return null; }
}

async function set(key: string, value: string): Promise<void> {
  if (isWeb) { localStorage.setItem(key, value); return; }
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.default.setItemAsync(key, value);
  } catch { /* ignore */ }
}

// --- Préférences génériques (ex: sonnerie) ---
export async function getSetting(key: string): Promise<string | null> {
  return get(`notre-bulle.setting.${key}`);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await set(`notre-bulle.setting.${key}`, value);
}

// --- Thème ---
export interface ChatTheme {
  bg: string;
  bubbleSelf: string;
  bubbleOther: string;
  backgroundImage?: string | null;
}

const DEFAULT_THEME: ChatTheme = {
  bg: '#FAF6F9',
  bubbleSelf: '#E8A0B4',
  bubbleOther: '#F0EBF3',
};

export async function getTheme(): Promise<ChatTheme> {
  try {
    const raw = await get('notre-bulle.theme');
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_THEME;
}

export async function saveTheme(theme: ChatTheme): Promise<void> {
  await set('notre-bulle.theme', JSON.stringify(theme));
}

// --- Fond d'écran du chat ---
export async function saveBackgroundImage(url: string): Promise<void> {
  const theme = await getTheme();
  theme.backgroundImage = url;
  await saveTheme(theme);
}

export async function removeBackgroundImage(): Promise<void> {
  const theme = await getTheme();
  theme.backgroundImage = null;
  await saveTheme(theme);
}

export async function getBackgroundImage(): Promise<string | null> {
  const theme = await getTheme();
  return theme.backgroundImage ?? null;
}
