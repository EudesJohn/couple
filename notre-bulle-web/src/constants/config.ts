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
  vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY ?? '',
  // Serveurs ICE pour WebRTC — utilise l'API Metered.ca
  // Inscris-toi sur https://metered.ca/turn (50 Go/mois gratuit)
  // puis mets ta clé API dans VITE_METERED_API_KEY.
  // En fallback, les STUN Google sont utilisés.
  meteredApiKey: env.VITE_METERED_API_KEY ?? '',
} as const;

export const STORAGE_BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;
