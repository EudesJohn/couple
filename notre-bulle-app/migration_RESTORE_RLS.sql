-- ============================================================
-- RESTAURATION DES POLICIES RLS ORIGINALES
-- Copie exacte de supabase-rls-policies.sql
-- Executer dans le SQL Editor Supabase
-- ============================================================

-- HELPERS
CREATE OR REPLACE FUNCTION public.is_authorized_profile()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (
  SELECT 1 FROM conversation_members cm
  JOIN profiles p ON p.id = cm.profile_id
  WHERE cm.conversation_id = conv_id AND p.auth_user_id = auth.uid()
); $$;

-- link_profile_to_auth
DROP FUNCTION IF EXISTS public.link_profile_to_auth(UUID, UUID);
CREATE OR REPLACE FUNCTION public.link_profile_to_auth(p_profile_id UUID, p_auth_user_id UUID, p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_hash text; v_valid boolean := false;
BEGIN
  IF p_pin IS NULL OR char_length(p_pin) <> 4 THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'PIN requis'); END IF;
  SELECT pin_hash INTO v_hash FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Profil introuvable'); END IF;
  IF v_hash IS NULL THEN RETURN jsonb_build_object('ok', TRUE); END IF;
  IF v_hash LIKE '$2%' THEN v_valid := (crypt(p_pin, v_hash) = v_hash);
  ELSE v_valid := (v_hash = encode(digest('notre-bulle-salt-' || p_pin, 'sha256'), 'hex')); END IF;
  IF NOT v_valid THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'PIN incorrect'); END IF;
  UPDATE public.profiles SET auth_user_id = p_auth_user_id, updated_at = now() WHERE id = p_profile_id;
  RETURN jsonb_build_object('ok', TRUE);
END; $$;
GRANT EXECUTE ON FUNCTION public.link_profile_to_auth(UUID, UUID, TEXT) TO anon;

-- profile_exists
CREATE OR REPLACE FUNCTION public.profile_exists(p_profile_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id); $$;
GRANT EXECUTE ON FUNCTION public.profile_exists(UUID) TO anon;

-- STORAGE
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
DROP POLICY IF EXISTS "storage_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_update_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "media_select_auth" ON storage.objects;

CREATE POLICY "storage_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('media', 'voice-notes', 'thumbnails'));
CREATE POLICY "storage_update_auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('media', 'voice-notes', 'thumbnails'));
CREATE POLICY "storage_delete_auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('media', 'voice-notes', 'thumbnails'));
CREATE POLICY "storage_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('voice-notes', 'thumbnails'));
CREATE POLICY "media_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media');

-- PROFILES
DROP POLICY IF EXISTS "Profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authorized" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_disabled" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_disabled" ON public.profiles;
CREATE POLICY "profiles_select_authorized" ON public.profiles FOR SELECT USING (is_authorized_profile());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth_user_id = auth.uid());
CREATE POLICY "profiles_insert_disabled" ON public.profiles FOR INSERT WITH CHECK (false);
CREATE POLICY "profiles_delete_disabled" ON public.profiles FOR DELETE USING (false);
REVOKE ALL ON public.profiles FROM anon;

-- CONVERSATIONS
DROP POLICY IF EXISTS "Conversations select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_select_authorized" ON public.conversations;
DROP POLICY IF EXISTS "conversations_select_members" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_disabled" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_disabled" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete_disabled" ON public.conversations;
DROP POLICY IF EXISTS "conv_sel" ON public.conversations;
CREATE POLICY "conversations_select_members" ON public.conversations FOR SELECT USING (is_conversation_member(id));
CREATE POLICY "conversations_insert_disabled" ON public.conversations FOR INSERT WITH CHECK (false);
CREATE POLICY "conversations_update_disabled" ON public.conversations FOR UPDATE USING (false);
CREATE POLICY "conversations_delete_disabled" ON public.conversations FOR DELETE USING (false);

-- CONVERSATION_MEMBERS
DROP POLICY IF EXISTS "conversation_members_select" ON public.conversation_members;
DROP POLICY IF EXISTS "conversation_members_insert_disabled" ON public.conversation_members;
DROP POLICY IF EXISTS "conversation_members_update_disabled" ON public.conversation_members;
DROP POLICY IF EXISTS "conversation_members_delete_disabled" ON public.conversation_members;
CREATE POLICY "conversation_members_select" ON public.conversation_members FOR SELECT USING (is_authorized_profile());
CREATE POLICY "conversation_members_insert_disabled" ON public.conversation_members FOR INSERT WITH CHECK (false);
CREATE POLICY "conversation_members_update_disabled" ON public.conversation_members FOR UPDATE USING (false);
CREATE POLICY "conversation_members_delete_disabled" ON public.conversation_members FOR DELETE USING (false);

-- MESSAGES
DROP POLICY IF EXISTS "Messages select" ON public.messages;
DROP POLICY IF EXISTS "Messages insert" ON public.messages;
DROP POLICY IF EXISTS "messages_select_authorized" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_authorized" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
DROP POLICY IF EXISTS "msg_sel" ON public.messages;
DROP POLICY IF EXISTS "msg_ins" ON public.messages;
DROP POLICY IF EXISTS "messages_select_members" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_members" ON public.messages;
DROP POLICY IF EXISTS "messages_update_members" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_disabled" ON public.messages;
CREATE POLICY "messages_select_members" ON public.messages FOR SELECT USING (is_conversation_member(conversation_id));
CREATE POLICY "messages_insert_members" ON public.messages FOR INSERT WITH CHECK (
  is_conversation_member(conversation_id)
  AND EXISTS (SELECT 1 FROM profiles WHERE id = sender_id AND auth_user_id = auth.uid())
);
CREATE POLICY "messages_update_members" ON public.messages FOR UPDATE USING (is_conversation_member(conversation_id));
CREATE POLICY "messages_delete_disabled" ON public.messages FOR DELETE USING (false);

-- ATTACHMENTS
DROP POLICY IF EXISTS "Attachments select" ON public.attachments;
DROP POLICY IF EXISTS "Attachments insert" ON public.attachments;
DROP POLICY IF EXISTS "attachments_select_authorized" ON public.attachments;
DROP POLICY IF EXISTS "attachments_insert_authorized" ON public.attachments;
DROP POLICY IF EXISTS "att_sel" ON public.attachments;
DROP POLICY IF EXISTS "att_ins" ON public.attachments;
DROP POLICY IF EXISTS "attachments_select_members" ON public.attachments;
DROP POLICY IF EXISTS "attachments_insert_members" ON public.attachments;
DROP POLICY IF EXISTS "attachments_update_disabled" ON public.attachments;
DROP POLICY IF EXISTS "attachments_delete_disabled" ON public.attachments;
CREATE POLICY "attachments_select_members" ON public.attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
);
CREATE POLICY "attachments_insert_members" ON public.attachments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
);
CREATE POLICY "attachments_update_disabled" ON public.attachments FOR UPDATE USING (false);
CREATE POLICY "attachments_delete_disabled" ON public.attachments FOR DELETE USING (false);

-- MESSAGE_STATUS
DROP POLICY IF EXISTS "Message status select" ON public.message_status;
DROP POLICY IF EXISTS "Message status insert" ON public.message_status;
DROP POLICY IF EXISTS "Message status upsert" ON public.message_status;
DROP POLICY IF EXISTS "message_status_select_authorized" ON public.message_status;
DROP POLICY IF EXISTS "message_status_insert_authorized" ON public.message_status;
DROP POLICY IF EXISTS "message_status_update_authorized" ON public.message_status;
DROP POLICY IF EXISTS "ms_sel" ON public.message_status;
DROP POLICY IF EXISTS "ms_ins" ON public.message_status;
DROP POLICY IF EXISTS "ms_upd" ON public.message_status;
DROP POLICY IF EXISTS "message_status_select_members" ON public.message_status;
DROP POLICY IF EXISTS "message_status_insert_own" ON public.message_status;
DROP POLICY IF EXISTS "message_status_update_own" ON public.message_status;
DROP POLICY IF EXISTS "message_status_delete_disabled" ON public.message_status;
CREATE POLICY "message_status_select_members" ON public.message_status FOR SELECT USING (
  EXISTS (SELECT 1 FROM messages m WHERE m.id = message_status.message_id AND is_conversation_member(m.conversation_id))
);
CREATE POLICY "message_status_insert_own" ON public.message_status FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
);
CREATE POLICY "message_status_update_own" ON public.message_status FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
);
CREATE POLICY "message_status_delete_disabled" ON public.message_status FOR DELETE USING (false);

-- CALLS
DROP POLICY IF EXISTS "calls_select_authorized" ON public.calls;
DROP POLICY IF EXISTS "calls_insert_authorized" ON public.calls;
DROP POLICY IF EXISTS "calls_update_authorized" ON public.calls;
DROP POLICY IF EXISTS "calls_delete_disabled" ON public.calls;
CREATE POLICY "calls_select_authorized" ON public.calls FOR SELECT USING (is_authorized_profile());
CREATE POLICY "calls_insert_authorized" ON public.calls FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND auth_user_id = auth.uid())
);
CREATE POLICY "calls_update_authorized" ON public.calls FOR UPDATE USING (is_authorized_profile());
CREATE POLICY "calls_delete_disabled" ON public.calls FOR DELETE USING (false);

-- PRESENCE
DROP POLICY IF EXISTS "presence_select_authorized" ON public.presence;
DROP POLICY IF EXISTS "presence_insert_own" ON public.presence;
DROP POLICY IF EXISTS "presence_update_own" ON public.presence;
DROP POLICY IF EXISTS "presence_delete_disabled" ON public.presence;
CREATE POLICY "presence_select_authorized" ON public.presence FOR SELECT USING (is_authorized_profile());
CREATE POLICY "presence_insert_own" ON public.presence FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
);
CREATE POLICY "presence_update_own" ON public.presence FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
);
CREATE POLICY "presence_delete_disabled" ON public.presence FOR DELETE USING (false);

-- PUSH_SUBSCRIPTIONS
DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_update_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_select_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
);
CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
);
CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
);
CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
);

-- CYCLE_ENTRIES
DROP POLICY IF EXISTS "cycle_select_authorized" ON public.cycle_entries;
DROP POLICY IF EXISTS "cycle_insert_authorized" ON public.cycle_entries;
DROP POLICY IF EXISTS "cycle_update_authorized" ON public.cycle_entries;
DROP POLICY IF EXISTS "cycle_delete_authorized" ON public.cycle_entries;
DROP POLICY IF EXISTS "cyc_all" ON public.cycle_entries;
DROP POLICY IF EXISTS "cycle_select_auth" ON public.cycle_entries;
DROP POLICY IF EXISTS "cycle_insert_auth" ON public.cycle_entries;
DROP POLICY IF EXISTS "cycle_update_auth" ON public.cycle_entries;
DROP POLICY IF EXISTS "cycle_delete_auth" ON public.cycle_entries;
CREATE POLICY "cycle_select_authorized" ON public.cycle_entries FOR SELECT USING (is_authorized_profile());
CREATE POLICY "cycle_insert_authorized" ON public.cycle_entries FOR INSERT WITH CHECK (is_authorized_profile());
CREATE POLICY "cycle_update_authorized" ON public.cycle_entries FOR UPDATE USING (is_authorized_profile());
CREATE POLICY "cycle_delete_authorized" ON public.cycle_entries FOR DELETE USING (is_authorized_profile());

SELECT 'OK RLS restaure avec succes' as status;
