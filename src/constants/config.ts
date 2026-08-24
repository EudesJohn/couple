import Constants from 'expo-constants';

// Récupération des variables d'environnement via app.json extra
export const config = {
  supabase: {
    url: Constants.expoConfig?.extra?.supabaseUrl ?? '',
    anonKey: Constants.expoConfig?.extra?.supabaseAnonKey ?? '',
  },
  // IDs Supabase pré-créés pour nous deux
  myProfileId: Constants.expoConfig?.extra?.myProfileId ?? '',
  partnerProfileId: Constants.expoConfig?.extra?.partnerProfileId ?? '',
  // Code PIN (hashé en production)
  appPin: Constants.expoConfig?.extra?.appPin ?? '1234',
  // Serveurs ICE pour WebRTC — utilise l'API Metered.ca
  // Inscris-toi sur https://metered.ca/turn (50 Go/mois gratuit) puis mets
  // ta clé dans meteredApiKey. En fallback, les STUN Google sont utilisés.
  meteredApiKey: Constants.expoConfig?.extra?.meteredApiKey ?? '',
} as const;

export const STORAGE_BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;
