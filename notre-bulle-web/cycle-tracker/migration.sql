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

-- Row Level Security
ALTER TABLE cycle_entries ENABLE ROW LEVEL SECURITY;

-- Lecture : chaque membre du couple peut voir les entrées de l'autre
CREATE POLICY "Les membres du couple peuvent lire les entrées"
  ON cycle_entries FOR SELECT
  USING (
    profile_id IN (
      SELECT cm.profile_id FROM conversation_members cm
      WHERE cm.conversation_id = (
        SELECT c.id FROM conversations c LIMIT 1
      )
    )
  );

-- Écriture : chaque profil ne peut insérer que ses propres entrées
CREATE POLICY "Chacun peut inserer ses propres entrées"
  ON cycle_entries FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- Modification : chacun peut modifier ses propres entrées
CREATE POLICY "Chacun peut modifier ses propres entrées"
  ON cycle_entries FOR UPDATE
  USING (profile_id = auth.uid());

-- Suppression : chacun peut supprimer ses propres entrées
CREATE POLICY "Chacun peut supprimer ses propres entrées"
  ON cycle_entries FOR DELETE
  USING (profile_id = auth.uid());
