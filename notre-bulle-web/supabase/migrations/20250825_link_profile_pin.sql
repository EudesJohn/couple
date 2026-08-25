-- ============================================================
-- Migration : Sécurisation de link_profile_to_auth (audit v3+)
--
-- 🚨 FAILLE CRITIQUE CORRIGÉE :
-- L'ancienne version de link_profile_to_auth(uuid, uuid), accessible à
-- anon via RPC, permettait à N'IMPORTE QUI de lier son propre compte
-- auth anonyme au profil de la victime (dès que auth_user_id est NULL)
-- → accès total RLS aux messages, médias, données de cycle.
--
-- Correctif :
--   1. La fonction exige désormais le PIN du couple (p_pin), vérifié
--      contre profiles.pin_hash (bcrypt OU SHA-256 legacy).
--   2. Le PIN correct autorise AUSSI de re-lier un profil déjà lié
--      (récupération sur nouvel appareil / navigateur effacé).
--   3. Côté app : l'appel est déplacé APRÈS la saisie réussie du PIN
--      (voir useAuth.tsx des deux apps).
--
-- Usage : exécuter ce fichier dans le Supabase SQL Editor.
-- ============================================================

-- 1. Supprimer l'ancienne signature non sécurisée
DROP FUNCTION IF EXISTS public.link_profile_to_auth(UUID, UUID);

-- 2. Nouvelle version protégée par PIN
CREATE OR REPLACE FUNCTION public.link_profile_to_auth(
  p_profile_id  UUID,
  p_auth_user_id UUID,
  p_pin         TEXT
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
    -- Aucun PIN défini (bootstrap) : liaison autorisée sans PIN,
    -- le PIN sera créé juste après par set_couple_pin.
    RETURN jsonb_build_object('ok', TRUE);
  END IF;

  -- Support bcrypt (nouveau) et SHA-256 (legacy, migré au login)
  IF v_hash LIKE '$2%' THEN
    v_valid := (crypt(p_pin, v_hash) = v_hash);
  ELSE
    v_valid := (v_hash = encode(digest('notre-bulle-salt-' || p_pin, 'sha256'), 'hex'));
  END IF;

  IF NOT v_valid THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'PIN incorrect');
  END IF;

  UPDATE public.profiles
     SET auth_user_id = p_auth_user_id,
         updated_at   = now()
   WHERE id = p_profile_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- 3. Accès RPC (la fonction reste joignable sans session — c'est le PIN
--    qui fait l'authentification, comme login_couple_pin)
REVOKE ALL ON FUNCTION public.link_profile_to_auth(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_profile_to_auth(UUID, UUID, TEXT) TO anon;

-- ============================================================
-- 4. Bonus : confirmer l'existence d'un profil sans lire la table
--    (l'app web vérifiait .from('profiles') ce qui est désormais
--    bloqué par RLS pour un visiteur non lié)
-- ============================================================
CREATE OR REPLACE FUNCTION public.profile_exists(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id);
$$;

GRANT EXECUTE ON FUNCTION public.profile_exists(UUID) TO anon;
