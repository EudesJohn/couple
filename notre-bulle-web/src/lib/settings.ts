// ============================================================
// Settings — stockage des préférences (thème, fond, etc.)
// Utilise localStorage (web)
// ============================================================

async function get(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

async function set(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
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
