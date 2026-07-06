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
  // Clé ZegoCloud
  zego: {
    appID: Constants.expoConfig?.extra?.zegoAppID ?? 0,
    appSign: Constants.expoConfig?.extra?.zegoAppSign ?? '',
  },
} as const;

export const STORAGE_BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;
