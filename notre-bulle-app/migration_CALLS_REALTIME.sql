-- ============================================================
-- Activer Realtime sur calls + vérifier messages/conversations
-- Exécuter dans le SQL Editor Supabase
-- ============================================================

-- S'assurer que la table calls existe
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calls' AND table_schema = 'public') THEN
    CREATE TABLE public.calls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      caller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('audio', 'video')),
      status TEXT NOT NULL DEFAULT 'missed' CHECK (status IN ('missed', 'answered', 'cancelled', 'failed')),
      started_at TIMESTAMPTZ,
      answered_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      duration_s INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON public.calls(caller_id);
  END IF;
END $$;

-- Ajouter calls à la publication Realtime (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE calls;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vérifier quelles tables sont dans la publication
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
