-- ============================================================
-- Fonction : update_partner_display_name
-- Permet à un utilisateur authentifié de modifier le display_name
-- de son partenaire (l'autre profil du couple).
-- Exécuter dans le SQL Editor Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_partner_display_name(p_new_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_my_profile_id UUID;
  v_partner_id UUID;
BEGIN
  -- Trouver le profil lié à cet auth user
  SELECT id INTO v_my_profile_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  IF v_my_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Profil non trouve');
  END IF;

  -- Trouver le partenaire (l'autre profil dans la conversation)
  SELECT cm2.profile_id INTO v_partner_id
  FROM public.conversation_members cm1
  JOIN public.conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id AND cm2.profile_id != cm1.profile_id
  WHERE cm1.profile_id = v_my_profile_id
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Partenaire introuvable');
  END IF;

  -- Modifier le display_name du partenaire
  UPDATE public.profiles
  SET display_name = p_new_name, updated_at = now()
  WHERE id = v_partner_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- Accès pour les utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.update_partner_display_name(TEXT) TO authenticated;

SELECT 'OK update_partner_display_name cree' as status;
