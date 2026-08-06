/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MY_PROFILE_ID: string;
  readonly VITE_PARTNER_PROFILE_ID: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_METERED_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
