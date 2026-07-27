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

-- ⚠️ RLS désactivé car l'app utilise l'authentification PIN (localStorage),
-- pas Supabase Auth. auth.uid() ne correspond à aucun profil.
-- La sécurité est gérée au niveau applicatif via le PIN.
ALTER TABLE cycle_entries DISABLE ROW LEVEL SECURITY;
