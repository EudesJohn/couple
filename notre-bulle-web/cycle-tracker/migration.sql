-- ============================================================
-- Migration : Cycle Tracker
-- Table pour les entrées de cycle menstruel
-- ============================================================

CREATE TABLE IF NOT EXISTS cycle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('period', 'symptom', 'note')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour requêtes rapides par profil + date
CREATE INDEX IF NOT EXISTS idx_cycle_entries_profile_date
  ON cycle_entries(profile_id, event_date DESC);

-- Permet un seul marquage par jour par type pour un profil
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycle_entries_unique_day
  ON cycle_entries(profile_id, event_date, event_type);

-- ============================================================
-- RLS SÉCURISÉ sur cycle_entries
--
-- ⚠️ SÉCURITÉ : RLS était DÉSACTIVÉ → lecture totale de vos
-- données de cycle menstruel par n'importe qui avec la clé anon.
-- On active maintenant RLS avec des policies basées sur auth.uid().
-- ============================================================

ALTER TABLE cycle_entries ENABLE ROW LEVEL SECURITY;

-- Helper is_authorized_profile() doit exister (voir schema principal)
-- Si elle n'existe pas, la créer :
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

-- SELECT : les deux membres du couple voient les données de cycle
CREATE POLICY "cycle_select_authorized" ON cycle_entries
  FOR SELECT USING (is_authorized_profile());

-- INSERT : un membre du couple peut ajouter des entrées
CREATE POLICY "cycle_insert_authorized" ON cycle_entries
  FOR INSERT WITH CHECK (is_authorized_profile());

-- UPDATE : un membre du couple peut modifier ses entrées
CREATE POLICY "cycle_update_authorized" ON cycle_entries
  FOR UPDATE USING (is_authorized_profile());

-- DELETE : un membre du couple peut supprimer ses entrées
CREATE POLICY "cycle_delete_authorized" ON cycle_entries
  FOR DELETE USING (is_authorized_profile());
