/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MY_PROFILE_ID: string;
  readonly VITE_PARTNER_PROFILE_ID: string;
  readonly VITE_ZEGO_APP_ID: string;
  readonly VITE_ZEGO_APP_SIGN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
