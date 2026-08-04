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

-- 4. RLS (Row Level Security) — les deux profils ont accès total
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Politique : les deux membres du couple ont tous les accès
CREATE POLICY full_access ON profiles
  FOR ALL USING (true);

CREATE POLICY full_access ON conversations
  FOR ALL USING (true);

CREATE POLICY full_access ON conversation_members
  FOR ALL USING (true);

CREATE POLICY full_access ON messages
  FOR ALL USING (true);

CREATE POLICY full_access ON attachments
  FOR ALL USING (true);

CREATE POLICY full_access ON message_status
  FOR ALL USING (true);

CREATE POLICY full_access ON calls
  FOR ALL USING (true);

CREATE POLICY full_access ON presence
  FOR ALL USING (true);

CREATE POLICY full_access ON push_subscriptions
  FOR ALL USING (true);

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

-- 6. Buckets de stockage + politiques RLS publiques
-- L'app utilise un PIN local (pas de session Supabase Auth),
-- donc les buckets ont besoin de politiques publiques
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('media', 'media', true),
  ('voice-notes', 'voice-notes', true),
  ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Supprimer les politiques existantes pour éviter les conflits
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

-- Politiques bucket media (avatars, backgrounds)
CREATE POLICY "Public upload media" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'media');
CREATE POLICY "Public read media" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'media');
CREATE POLICY "Public update media" ON storage.objects
  FOR UPDATE TO public USING (bucket_id = 'media');
CREATE POLICY "Public delete media" ON storage.objects
  FOR DELETE TO public USING (bucket_id = 'media');

-- Politiques bucket voice-notes
CREATE POLICY "Public upload voice-notes" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'voice-notes');
CREATE POLICY "Public read voice-notes" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'voice-notes');
CREATE POLICY "Public update voice-notes" ON storage.objects
  FOR UPDATE TO public USING (bucket_id = 'voice-notes');
CREATE POLICY "Public delete voice-notes" ON storage.objects
  FOR DELETE TO public USING (bucket_id = 'voice-notes');

-- Politiques bucket thumbnails
CREATE POLICY "Public upload thumbnails" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'thumbnails');
CREATE POLICY "Public read thumbnails" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'thumbnails');
CREATE POLICY "Public update thumbnails" ON storage.objects
  FOR UPDATE TO public USING (bucket_id = 'thumbnails');
CREATE POLICY "Public delete thumbnails" ON storage.objects
  FOR DELETE TO public USING (bucket_id = 'thumbnails');

-- 7. Activer Realtime sur les tables nécessaires
-- Dans Supabase > Database > Replication, ajoutez :
-- messages, message_status, presence, calls
