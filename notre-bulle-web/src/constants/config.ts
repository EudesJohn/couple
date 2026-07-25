// ============================================================
// Configuration applicative — variables d'environnement Vite
// ============================================================

const env = import.meta.env;

export const config = {
  supabase: {
    url: env.VITE_SUPABASE_URL ?? '',
    anonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
  },
  myProfileId: env.VITE_MY_PROFILE_ID ?? '',
  partnerProfileId: env.VITE_PARTNER_PROFILE_ID ?? '',
  zego: {
    appID: Number(env.VITE_ZEGO_APP_ID ?? 0),
    appSign: env.VITE_ZEGO_APP_SIGN ?? '',
  },
} as const;

export const STORAGE_BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;
