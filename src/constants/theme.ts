// Palette — tons chauds et doux pour "Notre Bulle"
export const colors = {
  // Couleurs principales
  primary: '#E8A0B4',       // Rose doux
  primaryDark: '#C77D92',
  secondary: '#B8A9C9',     // Lavande
  accent: '#F4C7AB',        // Pêche

  // Messages
  bubbleSelf: '#E8A0B4',    // Nos messages
  bubbleOther: '#F0EBF3',   // Ses messages
  bubbleSelfText: '#FFFFFF',
  bubbleOtherText: '#2D1B36',

  // Arrière-plans
  background: '#FAF6F9',    // Fond principal très clair
  surface: '#FFFFFF',
  surfaceAlt: '#F5EFF4',

  // Textes
  text: '#2D1B36',
  textSecondary: '#8A7A92',
  textTertiary: '#B8ABBE',

  // UI
  border: '#E8DFE5',
  divider: '#F0EBF3',
  inputBackground: '#F5F0F4',
  shadow: 'rgba(45, 27, 54, 0.08)',

  // Statuts
  success: '#7BC4A9',
  warning: '#F0C27A',
  error: '#E89292',
  online: '#7BC4A9',

  // Appels
  callGreen: '#7BC4A9',
  callRed: '#E89292',
  callMuted: '#B8ABBE',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const borderRadius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  heading: {
    fontSize: 28,
    fontWeight: '600' as const,
    lineHeight: 34,
  },
  subheading: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  tiny: {
    fontSize: 11,
    lineHeight: 14,
  },
} as const;
