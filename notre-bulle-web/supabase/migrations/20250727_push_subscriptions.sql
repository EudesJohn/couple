-- ============================================================
-- Migration : Table push_subscriptions
-- Stocke les abonnements Web Push par profil
-- Accédée uniquement par l'API Python (côté serveur, via la
-- clé anon Supabase), jamais directement par le frontend.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile_id
  ON push_subscriptions(profile_id);
