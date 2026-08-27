-- ============================================================
-- Migration : RLS + table push_subscriptions
-- ------------------------------------------------------------------
-- PROBLÈME CORRIGÉ :
-- La table push_subscriptions était créée SANS Row Level Security.
-- Or l'API Python (api/index.py) accède à cette table via la clé anon
-- Supabase (REST). En l'absence de politique RLS, Supabase (RLS activée
-- par défaut sur les projets) refuse l'INSERT/UPDATE/SELECT → la table
-- restait vide → AUCUNE notification push quand l'app est fermée.
--
-- CORRECTION :
--   1. Crée la table si elle n'existe pas (idempotent — le fichier
--      20250727_push_subscriptions.sql reste valable).
--   2. Active RLS (au cas où elle serait désactivée).
--   3. Politique `full_access` identique aux autres tables du schéma :
--      l'app utilise un PIN local (pas de session Supabase Auth), donc
--      les deux membres du couple ont accès total via la clé anon.
--
-- Usage : exécuter ce fichier dans le Supabase SQL Editor.
-- ============================================================

-- 1. Table (idempotente — complète la migration 20250727)
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

-- 2. RLS — SANS cette politique, l'API serveur (clé anon) ne peut
--    ni insérer ni lire les abonnements → push silencieusement cassé.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Politique : authentification requise
-- ⚠️ SÉCURITÉ : USING(true) donnait accès total à la clé anon
DROP POLICY IF EXISTS full_access ON push_subscriptions;

-- Helper is_authorized_profile() doit exister (voir schema principal)
CREATE OR REPLACE FUNCTION public.is_authorized_profile()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE auth_user_id = auth.uid()
  );
$$;

-- SELECT : uniquement les abonnements du profil courant
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

-- INSERT : uniquement pour son propre profil
CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

-- UPDATE : uniquement pour son propre profil
CREATE POLICY "push_subscriptions_update_own" ON push_subscriptions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

-- DELETE : uniquement pour son propre profil
CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

-- 4. Trigger updated_at (même convention que le schéma principal)
DROP TRIGGER IF EXISTS set_updated_at ON push_subscriptions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
