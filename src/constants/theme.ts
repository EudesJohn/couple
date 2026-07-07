// ============================================================
// 🎨 Thème — Notre Bulle
// Palette Burgundy + Gold — Premium, chaleureux, moderne
// ============================================================

export const colors = {
  // --- PRIMAIRES ---
  primary: '#7C2D12',        // Burgundy profond
  primaryLight: '#A0522D',   // Sienna
  primaryDark: '#5B1E0A',    // Burgundy foncé

  // --- ACCENTS ---
  accent: '#CA8A04',         // Or chaud
  accentLight: '#FBBF24',    // Or clair
  accentDark: '#A16207',     // Or foncé
  secondary: '#92400E',      // Marron chaud

  // --- FONDS ---
  background: '#F5F0EB',     // Beige chaud (moins blanc)
  surface: '#FAFAF9',        // Blanc cassé chaud
  surfaceAlt: '#F5F0EB',     // Beige clair
  surfaceAlt2: '#EFE9E1',    // Beige moyen
  surfaceDim: '#EDE9E3',     // Beige plus marqué

  // --- TEXTE ---
  text: '#1C1917',           // Presque noir chaud
  textSecondary: '#57534E',  // Gris chaud
  textTertiary: '#A8A29E',   // Gris clair
  textInverse: '#FAFAF9',   // Blanc sur fond foncé

  // --- BORDURES ---
  border: '#E7E5E4',        // Bordure chaude
  borderLight: '#F0EDEA',   // Bordure très claire

  // --- ÉTATS ---
  success: '#059669',        // Vert
  error: '#DC2626',          // Rouge
  warning: '#D97706',        // Orange
  online: '#10B981',         // Vert en ligne

  // --- BULLES DE CHAT ---
  bubbleSelf: '#7C2D12',     // Bulle envoyée
  bubbleOther: '#FFFFFF',    // Bulle reçue
  bubbleSelfText: '#FAFAF9', // Texte bulle envoyée

  // --- OMBRES ---
  shadow: 'rgba(28, 25, 23, 0.08)',
  shadowStrong: 'rgba(28, 25, 23, 0.15)',
  glow: 'rgba(202, 138, 4, 0.3)',           // Glow doré
  glowBurgundy: 'rgba(124, 45, 18, 0.2)',   // Glow burgundy

  // --- GRADIENTS (pour LinearGradient) ---
  gradient: {
    primary: ['#7C2D12', '#A0522D'] as const,
    accent: ['#CA8A04', '#FBBF24'] as const,
    darkToAccent: ['#5B1E0A', '#CA8A04'] as const,
  },
} as const;

// --- ESPACEMENTS ---
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

// --- BORDURES ---
export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

// --- TYPOGRAPHIE ---
export const typography = {
  heading: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    color: colors.text,
  },
  subheading: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
    color: colors.text,
  },
  body: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: 0,
    color: colors.text,
  },
  caption: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '400' as const,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
  label: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
    color: colors.text,
    textTransform: 'uppercase' as const,
  },
} as const;
