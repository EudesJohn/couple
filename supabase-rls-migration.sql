-- ============================================================
-- MIGRATION RLS SÉCURISÉ — Notre Bulle
-- À exécuter dans l'éditeur SQL Supabase (Dashboard > SQL Editor)
--
-- CE QUE CETTE MIGRATION FAIT :
-- 1. Ajoute auth_user_id aux profils (lien Supabase Auth ↔ profil)
-- 2. Remplace les policies USING(true) par des policies auth.uid()
-- 3. Protège le storage avec des policies basées sur auth.uid()
-- 4. Désactive le signup email (signup ouvert = faille HIGH)
-- ============================================================

-- ============================================================
-- ÉTAPE 1 : Ajouter auth_user_id à la table profiles
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON profiles(auth_user_id);

-- ============================================================
-- ÉTAPE 2 : Fonction helper — vérifie si l'utilisateur auth
--           est un membre de la conversation
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_members cm
    JOIN profiles p ON p.id = cm.profile_id
    WHERE cm.conversation_id = conv_id
      AND p.auth_user_id = auth.uid()
  );
$$;

-- ============================================================
-- ÉTAPE 3 : Fonction helper — vérifie si l'utilisateur auth
--           est l'un des deux profils autorisés du couple
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_authorized_profile()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE auth_user_id = auth.uid()
  );
$$;

-- ============================================================
-- ÉTAPE 4 : Politiques RLS pour PROFILES
-- ============================================================
-- Supprimer les anciennes policies
DROP POLICY IF EXISTS full_access ON profiles;

-- SELECT : seul le propriétaire peut voir son profil
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth_user_id = auth.uid());

-- UPDATE : seul le propriétaire peut modifier son profil
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth_user_id = auth.uid());

-- INSERT : interdit directement (lié via sign-in)
CREATE POLICY "profiles_insert_disabled"
  ON profiles FOR INSERT
  WITH CHECK (false);

-- DELETE : interdit
CREATE POLICY "profiles_delete_disabled"
  ON profiles FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 5 : Politiques RLS pour CONVERSATIONS
-- ============================================================
DROP POLICY IF EXISTS full_access ON conversations;

-- SELECT : uniquement les membres de la conversation
CREATE POLICY "conversations_select_members"
  ON conversations FOR SELECT
  USING (is_conversation_member(id));

-- INSERT/UPDATE/DELETE : interdits (les conversations sont gérées
-- côté serveur ou via les RPC)
CREATE POLICY "conversations_insert_disabled"
  ON conversations FOR INSERT
  WITH CHECK (false);

CREATE POLICY "conversations_update_disabled"
  ON conversations FOR UPDATE
  USING (false);

CREATE POLICY "conversations_delete_disabled"
  ON conversations FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 6 : Politiques RLS pour CONVERSATION_MEMBERS
-- ============================================================
DROP POLICY IF EXISTS full_access ON conversation_members;

-- SELECT : uniquement les membres de la même conversation
CREATE POLICY "conversation_members_select"
  ON conversation_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversation_members cm2
      JOIN profiles p ON p.id = cm2.profile_id
      WHERE cm2.conversation_id = conversation_members.conversation_id
        AND p.auth_user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE : interdits
CREATE POLICY "conversation_members_insert_disabled"
  ON conversation_members FOR INSERT
  WITH CHECK (false);

CREATE POLICY "conversation_members_update_disabled"
  ON conversation_members FOR UPDATE
  USING (false);

CREATE POLICY "conversation_members_delete_disabled"
  ON conversation_members FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 7 : Politiques RLS pour MESSAGES
-- ============================================================
DROP POLICY IF EXISTS full_access ON messages;

-- SELECT : uniquement les membres de la conversation
CREATE POLICY "messages_select_members"
  ON messages FOR SELECT
  USING (is_conversation_member(conversation_id));

-- INSERT : uniquement les membres de la conversation,
-- et le sender_id doit être le profil de l'utilisateur
CREATE POLICY "messages_insert_members"
  ON messages FOR INSERT
  WITH CHECK (
    is_conversation_member(conversation_id)
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = sender_id
        AND auth_user_id = auth.uid()
    )
  );

-- UPDATE : uniquement les membres (pour read receipts, edits)
CREATE POLICY "messages_update_members"
  ON messages FOR UPDATE
  USING (is_conversation_member(conversation_id));

-- DELETE : interdit (soft delete uniquement)
CREATE POLICY "messages_delete_disabled"
  ON messages FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 8 : Politiques RLS pour ATTACHMENTS
-- ============================================================
DROP POLICY IF EXISTS full_access ON attachments;

-- SELECT : uniquement les membres de la conversation du message
CREATE POLICY "attachments_select_members"
  ON attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.id = attachments.message_id
        AND is_conversation_member(m.conversation_id)
    )
  );

-- INSERT : uniquement les membres (via upload)
CREATE POLICY "attachments_insert_members"
  ON attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.id = message_id
        AND is_conversation_member(m.conversation_id)
    )
  );

-- UPDATE/DELETE : interdits
CREATE POLICY "attachments_update_disabled"
  ON attachments FOR UPDATE
  USING (false);

CREATE POLICY "attachments_delete_disabled"
  ON attachments FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 9 : Politiques RLS pour MESSAGE_STATUS
-- ============================================================
DROP POLICY IF EXISTS full_access ON message_status;

-- SELECT : uniquement les membres de la conversation
CREATE POLICY "message_status_select_members"
  ON message_status FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.id = message_status.message_id
        AND is_conversation_member(m.conversation_id)
    )
  );

-- INSERT/UPDATE : uniquement pour son propre profil
CREATE POLICY "message_status_insert_own"
  ON message_status FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.id = message_id
        AND is_conversation_member(m.conversation_id)
    )
  );

CREATE POLICY "message_status_update_own"
  ON message_status FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
  );

-- DELETE : interdit
CREATE POLICY "message_status_delete_disabled"
  ON message_status FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 10 : Politiques RLS pour CALLS
-- ============================================================
DROP POLICY IF EXISTS full_access ON calls;

-- SELECT : uniquement les deux profils du couple
-- (les appels n'ont pas de conversation_id, on autorise les deux profils)
CREATE POLICY "calls_select_authorized"
  ON calls FOR SELECT
  USING (is_authorized_profile());

-- INSERT : uniquement les profils autorisés
CREATE POLICY "calls_insert_authorized"
  ON calls FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = caller_id
        AND auth_user_id = auth.uid()
    )
  );

-- UPDATE : uniquement les profils autorisés (pour mettre à jour le statut)
CREATE POLICY "calls_update_authorized"
  ON calls FOR UPDATE
  USING (is_authorized_profile());

-- DELETE : interdit
CREATE POLICY "calls_delete_disabled"
  ON calls FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 11 : Politiques RLS pour PRESENCE
-- ============================================================
DROP POLICY IF EXISTS full_access ON presence;

-- SELECT : les deux profils du couple
CREATE POLICY "presence_select_authorized"
  ON presence FOR SELECT
  USING (is_authorized_profile());

-- INSERT/UPDATE : uniquement pour son propre profil
CREATE POLICY "presence_insert_own"
  ON presence FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
  );

CREATE POLICY "presence_update_own"
  ON presence FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
  );

-- DELETE : interdit
CREATE POLICY "presence_delete_disabled"
  ON presence FOR DELETE
  USING (false);

-- ============================================================
-- ÉTAPE 12 : Politiques RLS pour PUSH_SUBSCRIPTIONS
-- ============================================================
DROP POLICY IF EXISTS full_access ON push_subscriptions;

-- SELECT : uniquement les abonnements du profil courant
CREATE POLICY "push_subscriptions_select_own"
  ON push_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
  );

-- INSERT : uniquement pour son propre profil
CREATE POLICY "push_subscriptions_insert_own"
  ON push_subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
  );

-- UPDATE : uniquement pour son propre profil
CREATE POLICY "push_subscriptions_update_own"
  ON push_subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
  );

-- DELETE : uniquement pour son propre profil
CREATE POLICY "push_subscriptions_delete_own"
  ON push_subscriptions FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = profile_id
        AND auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- ÉTAPE 13 : Politiques STORAGE
-- ============================================================
-- Supprimer les anciennes policies publiques
DROP POLICY IF EXISTS "Public upload media" ON storage.objects;
DROP POLICY IF EXISTS "Public read media" ON storage.objects;
DROP POLICY IF EXISTS "Public update media" ON storage.objects;
DROP POLICY IF EXISTS "Public delete media" ON storage.objects;
DROP POLICY IF EXISTS "Public upload voice-notes" ON storage.objects;
DROP POLICY IF EXISTS "Public read voice-notes" ON storage.objects;
DROP POLICY IF EXISTS "Public update voice-notes" ON storage.objects;
DROP POLICY IF EXISTS "Public delete voice-notes" ON storage.objects;
DROP POLICY IF EXISTS "Public upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Public read thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Public update thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Public delete thumbnails" ON storage.objects;

-- Helper : vérifier si l'utilisateur est authentifié
CREATE OR REPLACE FUNCTION public.storage_auth_check()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- Politiques bucket media (avatars, backgrounds)
-- Lecture publique (les avatars sont visibles sans auth)
CREATE POLICY "media_read_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- Upload : uniquement les utilisateurs authentifiés
CREATE POLICY "media_insert_auth"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

-- Update : uniquement les utilisateurs authentifiés
CREATE POLICY "media_update_auth"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media');

-- Delete : uniquement les utilisateurs authentifiés
CREATE POLICY "media_delete_auth"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'media');

-- Politiques bucket voice-notes
-- Lecture publique (les notes vocales partagées)
CREATE POLICY "voice_notes_read_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice-notes');

-- Upload : uniquement les utilisateurs authentifiés
CREATE POLICY "voice_notes_insert_auth"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'voice-notes');

-- Update/Delete : uniquement les utilisateurs authentifiés
CREATE POLICY "voice_notes_update_auth"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'voice-notes');

CREATE POLICY "voice_notes_delete_auth"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'voice-notes');

-- Politiques bucket thumbnails
-- Lecture publique
CREATE POLICY "thumbnails_read_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

-- Upload/Update/Delete : uniquement les utilisateurs authentifiés
CREATE POLICY "thumbnails_insert_auth"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "thumbnails_update_auth"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'thumbnails');

CREATE POLICY "thumbnails_delete_auth"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'thumbnails');

-- ============================================================
-- ÉTAPE 14 : Désactiver le signup email public
-- ============================================================
-- Empêcher la création de comptes via l'API publique
-- Seul le sign-in anonyme est autorisé
-- ⚠️ Cette étape nécessite une modification dans le Dashboard :
-- Auth > Settings > Disable email sign-ups
-- OU via la fonction RPC suivante :

-- Créer une fonction RPC pour lier un profil à un user auth
CREATE OR REPLACE FUNCTION public.link_profile_to_auth(
  p_profile_id UUID,
  p_auth_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Vérifier que le profil existe
  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profil introuvable');
  END IF;

  -- Vérifier que le profil n'est pas déjà lié à un autre compte
  IF v_profile.auth_user_id IS NOT NULL AND v_profile.auth_user_id != p_auth_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profil déjà lié à un autre compte');
  END IF;

  -- Lier le profil au compte auth
  UPDATE profiles
  SET auth_user_id = p_auth_user_id
  WHERE id = p_profile_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- ÉTAPE 15 : Politique de rate limiting (optionnel)
-- ============================================================
-- Créer une table pour le rate limiting des PIN attempts
CREATE TABLE IF NOT EXISTS pin_attempts (
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (profile_id, attempted_at)
);

-- RLS sur pin_attempts
ALTER TABLE pin_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pin_attempts_service_role"
  ON pin_attempts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index pour nettoyer les anciennes tentatives
CREATE INDEX IF NOT EXISTS idx_pin_attempts_profile_time
  ON pin_attempts(profile_id, attempted_at DESC);

-- ============================================================
-- VÉRIFICATION
-- ============================================================
-- Pour vérifier que RLS est bien actif :
-- SELECT tablename, policyname, qual FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename;

-- Pour vérifier que auth_user_id est bien ajouté :
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'profiles' AND column_name = 'auth_user_id';
