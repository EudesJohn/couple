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
  // Serveurs ICE pour WebRTC (STUN + TURN optionnel)
  // VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL à définir pour
  // traverser les NAT symétriques (réseaux mobiles). Sans TURN, l'appel
  // fonctionne uniquement sur le même réseau local (Wi-Fi).
  // Fournisseur gratuit recommandé : https://metered.ca/turn (50 Go/mois)
  turn: {
    url: env.VITE_TURN_URL ?? '',
    username: env.VITE_TURN_USERNAME ?? '',
    credential: env.VITE_TURN_CREDENTIAL ?? '',
  },
} as const;

export const STORAGE_BUCKETS = {
  MEDIA: 'media',
  VOICE_NOTES: 'voice-notes',
  THUMBNAILS: 'thumbnails',
} as const;
