-- ============================================================
-- Schéma "Notre Bulle" — à exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1. ENUMS
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'voice', 'call', 'system');
CREATE TYPE delivery_status AS ENUM ('sent', 'delivered', 'read');
CREATE TYPE call_type AS ENUM ('audio', 'video');
CREATE TYPE call_status AS ENUM ('missed', 'answered', 'cancelled', 'failed');

-- 2. TABLES

-- Profils
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid UUID NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type message_type NOT NULL DEFAULT 'text',
  content TEXT,
  reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pièces jointes (images, vidéos, notes vocales)
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT,
  duration_ms INT,
  width INT,
  height INT,
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Statuts de lecture
CREATE TABLE message_status (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status delivery_status NOT NULL DEFAULT 'sent',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id)
);

-- Appels audio/vidéo
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type call_type NOT NULL,
  status call_status NOT NULL DEFAULT 'missed',
  started_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_s INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Présence en temps réel
CREATE TABLE presence (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  is_typing BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Abonnements Web Push (pour les notifications quand l'app est fermée)
-- Accédée par l'API Python via la clé anon → nécessite une politique RLS
-- (voir plus bas). Sans elle, la table reste vide → aucun push envoyé.
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, endpoint)
);

-- 3. INDEX
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_attachments_message ON attachments(message_id);
CREATE INDEX idx_calls_caller ON calls(caller_id);
CREATE INDEX idx_messages_reply_to ON messages(reply_to);
CREATE INDEX idx_push_subscriptions_profile_id ON push_subscriptions(profile_id);

-- 4. RLS (Row Level Security) — protection par auth.uid()
--
-- ⚠️ SÉCURITÉ : les policies USING(true) donnent un accès total
-- à toute personne possédant la clé anon. On exige maintenant
-- un auth.uid() valide lié à un profil du couple.
--
-- Helper : vérifie si auth.uid() est un membre autorisé du couple
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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_entries ENABLE ROW LEVEL SECURITY;

-- Ajouter auth_user_id si absent
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON profiles(auth_user_id);

-- --- PROFILES ---
-- SELECT : les deux membres du couple peuvent voir les deux profils
CREATE POLICY "profiles_select_authorized" ON profiles
  FOR SELECT USING (is_authorized_profile());

-- UPDATE : chaque profil ne peut modifier que le sien
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

-- INSERT/DELETE : interdits directement
CREATE POLICY "profiles_insert_disabled" ON profiles
  FOR INSERT WITH CHECK (false);
CREATE POLICY "profiles_delete_disabled" ON profiles
  FOR DELETE USING (false);

-- --- CONVERSATIONS ---
CREATE POLICY "conversations_select_members" ON conversations
  FOR SELECT USING (is_conversation_member(id));
CREATE POLICY "conversations_insert_disabled" ON conversations
  FOR INSERT WITH CHECK (false);
CREATE POLICY "conversations_update_disabled" ON conversations
  FOR UPDATE USING (false);
CREATE POLICY "conversations_delete_disabled" ON conversations
  FOR DELETE USING (false);

-- --- CONVERSATION_MEMBERS ---
CREATE POLICY "conversation_members_select" ON conversation_members
  FOR SELECT USING (is_authorized_profile());
CREATE POLICY "conversation_members_insert_disabled" ON conversation_members
  FOR INSERT WITH CHECK (false);
CREATE POLICY "conversation_members_update_disabled" ON conversation_members
  FOR UPDATE USING (false);
CREATE POLICY "conversation_members_delete_disabled" ON conversation_members
  FOR DELETE USING (false);

-- --- MESSAGES ---
CREATE POLICY "messages_select_members" ON messages
  FOR SELECT USING (is_conversation_member(conversation_id));
CREATE POLICY "messages_insert_members" ON messages
  FOR INSERT WITH CHECK (
    is_conversation_member(conversation_id)
    AND EXISTS (SELECT 1 FROM profiles WHERE id = sender_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "messages_update_members" ON messages
  FOR UPDATE USING (is_conversation_member(conversation_id));
CREATE POLICY "messages_delete_disabled" ON messages
  FOR DELETE USING (false);

-- --- ATTACHMENTS ---
CREATE POLICY "attachments_select_members" ON attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
  );
CREATE POLICY "attachments_insert_members" ON attachments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
  );
CREATE POLICY "attachments_update_disabled" ON attachments
  FOR UPDATE USING (false);
CREATE POLICY "attachments_delete_disabled" ON attachments
  FOR DELETE USING (false);

-- --- MESSAGE_STATUS ---
CREATE POLICY "message_status_select_members" ON message_status
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM messages m WHERE m.id = message_status.message_id AND is_conversation_member(m.conversation_id))
  );
CREATE POLICY "message_status_insert_own" ON message_status
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id))
  );
CREATE POLICY "message_status_update_own" ON message_status
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "message_status_delete_disabled" ON message_status
  FOR DELETE USING (false);

-- --- CALLS ---
CREATE POLICY "calls_select_authorized" ON calls
  FOR SELECT USING (is_authorized_profile());
CREATE POLICY "calls_insert_authorized" ON calls
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "calls_update_authorized" ON calls
  FOR UPDATE USING (is_authorized_profile());
CREATE POLICY "calls_delete_disabled" ON calls
  FOR DELETE USING (false);

-- --- PRESENCE ---
CREATE POLICY "presence_select_authorized" ON presence
  FOR SELECT USING (is_authorized_profile());
CREATE POLICY "presence_insert_own" ON presence
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "presence_update_own" ON presence
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "presence_delete_disabled" ON presence
  FOR DELETE USING (false);

-- --- CYCLE_ENTRIES ---
CREATE POLICY "cycle_select_authorized" ON cycle_entries
  FOR SELECT USING (is_authorized_profile());
CREATE POLICY "cycle_insert_authorized" ON cycle_entries
  FOR INSERT WITH CHECK (is_authorized_profile());
CREATE POLICY "cycle_update_authorized" ON cycle_entries
  FOR UPDATE USING (is_authorized_profile());
CREATE POLICY "cycle_delete_authorized" ON cycle_entries
  FOR DELETE USING (is_authorized_profile());

-- --- PUSH_SUBSCRIPTIONS ---
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "push_subscriptions_update_own" ON push_subscriptions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );
CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND auth_user_id = auth.uid())
  );

-- 5. TRIGGER updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. Buckets de stockage + politiques RLS SÉCURISÉES
--
-- ⚠️ SÉCURITÉ : les buckets PUBLIC + policies TO public permettent
-- à n'importe qui de télécharger tous les médias (avatars, photos,
-- notes vocales) via la clé anon. On force maintenant l'auth.
--
-- Les buckets restent en lecture publique pour les AVATARS uniquement.
-- Les notes vocales et thumbnails ne sont lisibles que par les membres.

-- Mettre les buckets en mode privé
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('media', 'media', false),
  ('voice-notes', 'voice-notes', false),
  ('thumbnails', 'thumbnails', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

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

-- Politiques bucket media : lecture via URL signée, upload/auth par authentifiés
CREATE POLICY "media_insert_auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');
CREATE POLICY "media_update_auth" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'media');
CREATE POLICY "media_delete_auth" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'media');
-- Lecture : les profils du couple (utilisateurs authentifiés)
-- ⚠️ AUDIT v3 : AUCUNE policy SELECT publique (pas d'exception avatars).
-- Une policy sans `TO authenticated` s'applique aussi à anon et permet
-- le bypass des signed URLs (/object/sign). L'app télécharge via token
-- de session ou proxy service_role.
CREATE POLICY "media_select_auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'media');

-- Politiques bucket voice-notes
CREATE POLICY "voice_notes_insert_auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice-notes');
CREATE POLICY "voice_notes_update_auth" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'voice-notes');
CREATE POLICY "voice_notes_delete_auth" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'voice-notes');
CREATE POLICY "voice_notes_select_auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'voice-notes');

-- Politiques bucket thumbnails
CREATE POLICY "thumbnails_insert_auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'thumbnails');
CREATE POLICY "thumbnails_update_auth" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'thumbnails');
CREATE POLICY "thumbnails_delete_auth" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'thumbnails');
CREATE POLICY "thumbnails_select_auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'thumbnails');

-- 7. Activer Realtime sur les tables nécessaires
-- Dans Supabase > Database > Replication, ajoutez :
-- messages, message_status, presence, calls
