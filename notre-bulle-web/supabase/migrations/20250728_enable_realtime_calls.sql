-- ============================================================
-- Migration : Activer Realtime sur la table calls
-- Permet à la détection d'appel entrant (INSERT) et à la
-- réponse d'appel (UPDATE) de fonctionner via postgres_changes
-- ============================================================

-- Créer la table si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS calls (
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

-- Index pour les recherches par caller
CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON calls(caller_id);

-- Ajouter la table à la publication Realtime
-- (ne fait rien si déjà présent)
ALTER PUBLICATION supabase_realtime ADD TABLE calls;
