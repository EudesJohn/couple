-- ============================================================
-- NOTRE BULLE — TOUTES LES MIGRATIONS EN UN
-- Copier-coller dans le SQL Editor Supabase, puis cliquer Run
-- ============================================================

-- 1. link_profile_to_auth
DROP FUNCTION IF EXISTS public.link_profile_to_auth(UUID, UUID);

CREATE OR REPLACE FUNCTION public.link_profile_to_auth(
  p_profile_id UUID,
  p_auth_user_id UUID,
  p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_valid boolean := false;
BEGIN
  IF p_pin IS NULL OR char_length(p_pin) <> 4 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'PIN requis');
  END IF;
  SELECT pin_hash INTO v_hash FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Profil introuvable');
  END IF;
  IF v_hash IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE);
  END IF;
  IF v_hash LIKE '$2%' THEN
    v_valid := (crypt(p_pin, v_hash) = v_hash);
  ELSE
    v_valid := (v_hash = encode(digest('notre-bulle-salt-' || p_pin, 'sha256'), 'hex'));
  END IF;
  IF NOT v_valid THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'PIN incorrect');
  END IF;
  UPDATE public.profiles SET auth_user_id = p_auth_user_id, updated_at = now() WHERE id = p_profile_id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.link_profile_to_auth(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_profile_to_auth(UUID, UUID, TEXT) TO anon;

-- 2. profile_exists
CREATE OR REPLACE FUNCTION public.profile_exists(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id); $$;
GRANT EXECUTE ON FUNCTION public.profile_exists(UUID) TO anon;

-- 3. is_authorized_profile
CREATE OR REPLACE FUNCTION public.is_authorized_profile()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid()); $$;

-- 4. RLS profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_authorized" ON public.profiles;
CREATE POLICY "profiles_select_authorized" ON public.profiles FOR SELECT TO authenticated USING (is_authorized_profile());
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth_user_id = auth.uid());
DROP POLICY IF EXISTS "profiles_insert_disabled" ON public.profiles;
CREATE POLICY "profiles_insert_disabled" ON public.profiles FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "profiles_delete_disabled" ON public.profiles;
CREATE POLICY "profiles_delete_disabled" ON public.profiles FOR DELETE TO authenticated USING (false);
REVOKE ALL ON public.profiles FROM anon;

-- 5. RLS messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select_authorized" ON public.messages;
CREATE POLICY "messages_select_authorized" ON public.messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "messages_insert_authorized" ON public.messages;
CREATE POLICY "messages_insert_authorized" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE TO authenticated USING (true);

-- 6. RLS message_status
ALTER TABLE public.message_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_status_select_authorized" ON public.message_status;
CREATE POLICY "message_status_select_authorized" ON public.message_status FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "message_status_insert_authorized" ON public.message_status;
CREATE POLICY "message_status_insert_authorized" ON public.message_status FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "message_status_update_authorized" ON public.message_status;
CREATE POLICY "message_status_update_authorized" ON public.message_status FOR UPDATE TO authenticated USING (true);

-- 7. RLS attachments
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attachments_select_authorized" ON public.attachments;
CREATE POLICY "attachments_select_authorized" ON public.attachments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "attachments_insert_authorized" ON public.attachments;
CREATE POLICY "attachments_insert_authorized" ON public.attachments FOR INSERT TO authenticated WITH CHECK (true);

-- 8. RLS conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversations_select_authorized" ON public.conversations;
CREATE POLICY "conversations_select_authorized" ON public.conversations FOR SELECT TO authenticated USING (true);

-- 9. RLS cycle_entries (si la table existe)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cycle_entries' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.cycle_entries ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "cycle_select_auth" ON public.cycle_entries';
    EXECUTE 'CREATE POLICY "cycle_select_auth" ON public.cycle_entries FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "cycle_insert_auth" ON public.cycle_entries';
    EXECUTE 'CREATE POLICY "cycle_insert_auth" ON public.cycle_entries FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'DROP POLICY IF EXISTS "cycle_update_auth" ON public.cycle_entries';
    EXECUTE 'CREATE POLICY "cycle_update_auth" ON public.cycle_entries FOR UPDATE TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "cycle_delete_auth" ON public.cycle_entries';
    EXECUTE 'CREATE POLICY "cycle_delete_auth" ON public.cycle_entries FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;

-- 10. RLS push_subscriptions (si la table existe)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_subscriptions' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "push_select_own" ON public.push_subscriptions';
    EXECUTE 'CREATE POLICY "push_select_own" ON public.push_subscriptions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "push_insert_own" ON public.push_subscriptions';
    EXECUTE 'CREATE POLICY "push_insert_own" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid()))';
  END IF;
END $$;

-- 11. Realtime
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE messages';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_status') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE message_status';
  END IF;
END $$;

-- DONE
SELECT 'OK toutes les migrations appliquees' as status;
