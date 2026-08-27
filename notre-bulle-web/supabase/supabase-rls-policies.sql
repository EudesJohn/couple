-- ============================================================
-- Policies RLS SÉCURISÉES pour "Notre Bulle"
-- Execute ce fichier dans l'éditeur SQL de Supabase Dashboard
-- (Project > SQL Editor > New Query)
--
-- ⚠️ SÉCURITÉ : les anciennes policies USING(true) donnaient
-- un accès total à toute personne avec la clé anon.
-- On exige maintenant un auth.uid() valide lié à un profil du couple.
-- ============================================================

-- ============================================================
-- HELPERS — fonctions security definer
-- ============================================================

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
-- 1. ACTIVER RLS SUR LES TABLES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. STORAGE — Policies basées sur auth.uid()
-- ============================================================
-- Supprimer les anciennes policies
DROP POLICY IF EXISTS "Storage public upload" ON storage.objects;
DROP POLICY IF EXISTS "Storage public select" ON storage.objects;
DROP POLICY IF EXISTS "Storage public update" ON storage.objects;
DROP POLICY IF EXISTS "Storage public delete" ON storage.objects;
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

-- Upload : uniquement les utilisateurs authentifiés
CREATE POLICY "storage_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('media', 'voice-notes', 'thumbnails'));

-- Update/Delete : uniquement les utilisateurs authentifiés
CREATE POLICY "storage_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('media', 'voice-notes', 'thumbnails'));

CREATE POLICY "storage_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('media', 'voice-notes', 'thumbnails'));

-- SELECT : utilisateurs authentifiés pour voice-notes et thumbnails
CREATE POLICY "storage_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('voice-notes', 'thumbnails'));

-- SELECT media : authentifiés UNIQUEMENT.
-- ⚠️ AUDIT v3 : plus aucune policy SELECT sans `TO authenticated` —
-- sinon la clé anon peut générer des signed URLs et contourner
-- la privacité des buckets. L'app télécharge via token de session
-- ou via le proxy service_role.
CREATE POLICY "media_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media');

-- ============================================================
-- 3. PROFILES
-- ============================================================
DROP POLICY IF EXISTS "Profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;

-- SELECT : les deux membres du couple voient les deux profils
CREATE POLICY "profiles_select_authorized" ON public.profiles
  FOR SELECT USING (is_authorized_profile());

-- UPDATE : chaque profil ne peut modifier que le sien
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

-- INSERT/DELETE : interdits
CREATE POLICY "profiles_insert_disabled" ON public.profiles
  FOR INSERT WITH CHECK (false);
CREATE POLICY "profiles_delete_disabled" ON public.profiles
  FOR DELETE USING (false);

-- ============================================================
-- 4. CONVERSATIONS
-- ============================================================
DROP POLICY IF EXISTS "Conversations select" ON public.conversations;

CREATE POLICY "conversations_select_members" ON public.conversations
  FOR SELECT USING (is_conversation_member(id));

CREATE POLICY "conversations_insert_disabled" ON public.conversations
  FOR INSERT WITH CHECK (false);
CREATE POLICY "conversations_update_disabled" ON public.conversations
  FOR UPDATE USING (false);
CREATE POLICY "conversations_delete_disabled" ON public.conversations
  FOR DELETE USING (false);

-- ============================================================
-- 5. CONVERSATION_MEMBERS
-- ============================================================
CREATE POLICY "conversation_members_select" ON public.conversation_members
  FOR SELECT USING (is_authorized_profile());

CREATE POLICY "conversation_members_insert_disabled" ON public.conversation_members
  FOR INSERT WITH CHECK (false);
CREATE POLICY "conversation_members_update_disabled" ON public.conversation_members
  FOR UPDATE USING (false);
CREATE POLICY "conversation_members_delete_disabled" ON public.conversation_members
  FOR DELETE USING (false);

-- ============================================================
-- 6. MESSAGES
-- ============================================================
DROP POLICY IF EXISTS "Messages select" ON public.messages;
DROP POLICY IF EXISTS "Messages insert" ON public.messages;

CREATE POLICY "messages_select_members" ON public.messages
  FOR SELECT USING (is_conversation_member(conversation_id));

CREATE POLICY "messages_insert_members" ON public.messages
  FOR INSERT WITH CHECK (
    is_conversation_member(conversation_id)
    AND EXISTS (SELECT 1 FROM profiles WHERE id = sender_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "messages_update_members" ON public.messages
  FOR UPDATE USING (is_conversation_member(conversation_id));

CREATE POLICY "messages_delete_disabled" ON public.messages
  FOR DELETE USING (false);

-- ============================================================
-- 7. ATTACHMENTS
-- ============================================================
DROP POLICY IF EXISTS "Attachments select" ON public.attachments;
DROP POLICY IF EXISTS "Attachments insert" ON public.attachments;

CREATE POLICY "attachments_select_members" ON public.attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
  );

CREATE POLICY "attachments_insert_members" ON public.attachments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
  );

CREATE POLICY "attachments_update_disabled" ON public.attachments
  FOR UPDATE USING (false);
CREATE POLICY "attachments_delete_disabled" ON public.attachments
  FOR DELETE USING (false);

-- ============================================================
-- 8. MESSAGE_STATUS
-- ============================================================
DROP POLICY IF EXISTS "Message status select" ON public.message_status;
DROP POLICY IF EXISTS "Message status insert" ON public.message_status;
DROP POLICY IF EXISTS "Message status upsert" ON public.message_status;

CREATE POLICY "message_status_select_members" ON public.message_status
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM messages m WHERE m.id = message_status.message_id AND is_conversation_member(m.conversation_id))
  );

CREATE POLICY "message_status_insert_own" ON public.message_status
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
  );

CREATE POLICY "message_status_update_own" ON public.message_status
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "message_status_delete_disabled" ON public.message_status
  FOR DELETE USING (false);

-- ============================================================
-- 9. CALLS
-- ============================================================
CREATE POLICY "calls_select_authorized" ON public.calls
  FOR SELECT USING (is_authorized_profile());

CREATE POLICY "calls_insert_authorized" ON public.calls
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "calls_update_authorized" ON public.calls
  FOR UPDATE USING (is_authorized_profile());

CREATE POLICY "calls_delete_disabled" ON public.calls
  FOR DELETE USING (false);

-- ============================================================
-- 10. PRESENCE
-- ============================================================
CREATE POLICY "presence_select_authorized" ON public.presence
  FOR SELECT USING (is_authorized_profile());

CREATE POLICY "presence_insert_own" ON public.presence
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "presence_update_own" ON public.presence
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "presence_delete_disabled" ON public.presence
  FOR DELETE USING (false);

-- ============================================================
-- 11. PUSH_SUBSCRIPTIONS
-- ============================================================
CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

-- ============================================================
-- 12. CYCLE_ENTRIES
-- ============================================================
CREATE POLICY "cycle_select_authorized" ON public.cycle_entries
  FOR SELECT USING (is_authorized_profile());

CREATE POLICY "cycle_insert_authorized" ON public.cycle_entries
  FOR INSERT WITH CHECK (is_authorized_profile());

CREATE POLICY "cycle_update_authorized" ON public.cycle_entries
  FOR UPDATE USING (is_authorized_profile());

CREATE POLICY "cycle_delete_authorized" ON public.cycle_entries
  FOR DELETE USING (is_authorized_profile());

-- ============================================================
-- 13. VÉRIFICATION
-- ============================================================
-- Pour vérifier que RLS est bien actif :
-- SELECT tablename, policyname, qual FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename;
