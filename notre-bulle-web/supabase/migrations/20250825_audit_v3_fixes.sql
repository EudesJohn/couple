-- ============================================================
-- Migration : Correctifs audit v3 (25 août 2026)
-- https://…/codescan/rapports/notre_bulle_audit_v3.html
--
-- Corrige les vulnérabilités restantes :
--
-- 🔴 CRITIQUE — Bypass Storage par signed URL
--    Cause : la policy "media_select_public_avatars" n'a PAS de clause
--    `TO authenticated` → elle s'applique aussi au rôle anon. Or dans
--    Supabase Storage, POST /storage/v1/object/sign exige uniquement le
--    privilège SELECT → la clé anon pouvait signer N'IMPORTE QUEL fichier.
--    Fix : suppression de toute policy SELECT publique sur storage.objects,
--    toutes les policies SELECT sont désormais `TO authenticated`.
--    L'app web télécharge via downloadMedia() (token de session) ou le
--    proxy /api/supa/storage/download (service_role) → aucun impact UI.
--
-- 🟡 MEDIUM — Table profiles lisible par anon
--    Cause : policies sans clause TO + possibles vieilles policies
--    "full_access" restées en place (les policies PERMISSIVE se combinent
--    en OR : une seule permissive suffit à tout ouvrir).
--    Fix : DROP de TOUTES les policies sur profiles puis recréation
--    explicite `TO authenticated`, + REVOKE des privilèges table à anon
--    (défense en profondeur ; les RPC PIN sont SECURITY DEFINER et
--    continuent de fonctionner).
--
-- ⚠️ PIN SHA-256 résiduel (profil 0edca7b6-…) :
--    Aucun SQL nécessaire — login_couple_pin() migre automatiquement le
--    hash vers bcrypt (cost 12) AU PROCHAIN LOGIN réussi de ce profil.
--    Action : se connecter une fois avec le PIN de ce profil.
--
-- 🟠 HIGH — Inscription publique ouverte :
--    Non corrigeable en SQL. Action manuelle OBLIGATOIRE :
--    Dashboard Supabase → Authentication → Providers → Email →
--    désactiver "Allow new users to sign up" (ou confirmer les emails
--    manuellement). Vérifier aussi Authentication → Policies →
--    "Allow new users to sign up" = OFF.
--
-- Usage : exécuter ce fichier dans le Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. STORAGE — Fermer le bypass des signed URLs
-- ============================================================

-- Supprimer la policy publique avatars (cause du bypass) et toute
-- policy héritée des anciens scripts, puis recréer les policies SELECT
-- strictement réservées aux authentifiés.
DROP POLICY IF EXISTS "media_select_public_avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read media" ON storage.objects;
DROP POLICY IF EXISTS "Public read voice-notes" ON storage.objects;
DROP POLICY IF EXISTS "Public read thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Storage public select" ON storage.objects;
DROP POLICY IF EXISTS "media_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "voice_notes_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "thumbnails_select_auth" ON storage.objects;

-- La génération de signed URLs (/object/sign) et la lecture directe
-- (/object/<bucket>/<path>) exigent désormais un JWT authenticated.
CREATE POLICY "media_select_auth"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'media');

CREATE POLICY "voice_notes_select_auth"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'voice-notes');

CREATE POLICY "thumbnails_select_auth"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'thumbnails');

-- Filet de sécurité : supprimer toute policy SELECT restante qui ne
-- ciblerait PAS explicitement un rôle authentifié/service_role.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, roles
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND ('anon' = ANY (roles) OR 'public' = ANY (roles))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    RAISE NOTICE 'Policy SELECT publique supprimée : %', pol.policyname;
  END LOOP;
END $$;

-- ============================================================
-- 2. PROFILES — Réinitialisation complète des policies
-- ============================================================

-- Drop de TOUTES les policies existantes sur profiles (y compris les
-- vieilles "full_access" éventuelles qui ouvrent tout en OR)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    RAISE NOTICE 'Policy profiles supprimée : %', pol.policyname;
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT : uniquement les profils du couple, rôle authenticated ONLY.
-- (anon ne voit plus RIEN : ni display_name, ni avatar_path, ni hash)
CREATE POLICY "profiles_select_authorized"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_authorized_profile());

-- UPDATE : chaque profil ne modifie que le sien
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid());

-- INSERT/DELETE : interdits
CREATE POLICY "profiles_insert_disabled"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "profiles_delete_disabled"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (false);

-- Défense en profondeur : retirer à anon tout accès table direct.
-- Les fonctions RPC (get_couple_auth_state, login_couple_pin, etc.)
-- sont SECURITY DEFINER → elles ne dépendent pas de ces grants.
REVOKE ALL ON public.profiles FROM anon;

-- Re-masquer pin_hash par colonne (au cas où un GRANT global aurait
-- été repassé après la migration 20250731_server_pin_auth.sql)
REVOKE SELECT (pin_hash) ON public.profiles FROM anon;
REVOKE UPDATE (pin_hash) ON public.profiles FROM anon;
REVOKE SELECT (pin_hash) ON public.profiles FROM authenticated;
REVOKE UPDATE (pin_hash) ON public.profiles FROM authenticated;

-- ============================================================
-- 3. VÉRIFICATION
-- ============================================================
-- Aucune policy storage SELECT ouverte à anon/public :
-- SELECT policyname FROM pg_policies
-- WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT';
--   → doit retourner uniquement des policies avec roles ⊆ {authenticated}
--
-- profiles inaccessible à anon :
--   GET /rest/v1/profiles avec la clé anon → [] (et plus de pin_hash)
-- Signed URL en anon :
--   POST /storage/v1/object/sign/media/avatars/<fichier> → 403
