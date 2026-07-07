/** @type {import('tailwindcss').Config} */
module.exports = {
  // Forcer 'class' pour éviter l'erreur web "Cannot manually set color scheme"
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#E8A0B4',
        secondary: '#B8A9C9',
        accent: '#F4C7AB',
        surface: '#FAF6F9',
        surfaceAlt: '#F0E8ED',
        text: '#2D1B36',
        textSecondary: '#6B4F6B',
        textTertiary: '#A48FA4',
        border: '#E8DEE3',
        success: '#6BBF8A',
        warning: '#E8A04E',
        error: '#D95763',
        callRed: '#D95763',
        online: '#6BBF8A',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
  // Forcer 'class' pour désactiver le mode 'media' par défaut de NativeWind
  safari: { darkMode: 'class' },
};
