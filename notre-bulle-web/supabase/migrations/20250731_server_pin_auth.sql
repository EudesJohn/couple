-- ============================================================
-- Migration : PIN côté serveur (sécurisation multi-appareils)
--
-- Problème : le PIN était stocké UNIQUEMENT en localStorage →
-- n'importe quel navigateur/appareil pouvait créer un nouveau PIN
-- en entrant un UUID public, sans jamais en connaître un existant.
--
-- Solution :
--   1. Le PIN (hash SHA-256) vit UNIQUEMENT en base (profiles.pin_hash).
--   2. La colonne pin_hash est masquée à l'API REST anon (lecture + écriture).
--   3. Les seuls accès passent par des fonctions RPC (security definer) :
--      - get_couple_auth_state : un PIN existe-t-il ? epoch de session ?
--      - set_couple_pin        : créer le PIN UNIQUEMENT s'il n'existe pas
--                                (bootstrap du 1er appareil)
--      - verify_couple_pin     : vérifier un PIN (sans révéler le hash)
--      - login_couple_pin      : vérifier + incrémenter l'epoch de session
--                                → force la déconnexion des autres appareils
--      - change_couple_pin     : changer le PIN (exige l'ancien) + epoch++
--
-- ⚠️ IMPORTANT : toutes les références de colonnes sont qualifiées
-- (s.session_epoch, p.pin_hash…) car avec `returns table(session_epoch int)`
-- PostgreSQL confond la colonne de sortie avec celle de la table
-- ("column reference ... is ambiguous"). Toujours aliaser les tables.
--
-- Usage : exécuter ce fichier dans le Supabase SQL Editor.
-- ============================================================

-- 1. Colonne pin_hash (si absente)
alter table public.profiles add column if not exists pin_hash text;

-- 2. Masquer pin_hash à l'API REST (lecture + écriture) pour anon
--    et authenticated (l'app n'utilise que la clé anon).
revoke select (pin_hash) on public.profiles from anon;
revoke update (pin_hash) on public.profiles from anon;
revoke select (pin_hash) on public.profiles from authenticated;
revoke update (pin_hash) on public.profiles from authenticated;

-- 3. pgcrypto pour le hashing (bcrypt pour PIN + SHA-256 legacy)
create extension if not exists pgcrypto;

-- ⚠️ SÉCURITÉ : migration de SHA-256 vers bcrypt
-- SHA-256 est vulnérable au brute-force (10 000 combinaisons = instantané)
-- bcrypt avec un sel aléatoire rend le crack quasi impossible
-- Fonction de migration : convertit un hash SHA-256 existant en bcrypt
create or replace function public.migrate_pin_to_bcrypt(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Ne fait rien si le hash est déjà en bcrypt (commence par '$2')
  if exists (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.pin_hash IS NOT NULL
      AND p.pin_hash LIKE '$2%'
  ) then
    return;
  end if;
  -- Note: la migration réelle nécessite de connaître le PIN
  -- Elle est faite lors du prochain login成功
end;
$$;

-- 4. Table de session par profil — l'epoch est incrémenté à chaque
--    connexion réussie (login / création / changement de PIN).
--    Un appareil dont l'epoch local est périmé est automatiquement
--    déconnecté : un autre appareil s'est connecté depuis.
--    Aucune RLS ni grant anon → table inaccessible via l'API REST.
create table if not exists public.couple_sessions (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  session_epoch integer not null default 0,
  updated_at    timestamptz not null default now()
);

-- 5. Fonctions RPC

-- get_couple_auth_state : état d'authentification d'un profil.
create or replace function public.get_couple_auth_state(p_profile_id uuid)
returns table(has_pin boolean, session_epoch int)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    exists (select 1 from public.profiles p where p.id = p_profile_id and p.pin_hash is not null) as has_pin,
    coalesce((select s.session_epoch from public.couple_sessions s where s.profile_id = p_profile_id), 0) as session_epoch;
end;
$$;

-- verify_couple_pin : vérifie un PIN (utilisé par Réglages avant
-- de proposer un nouveau code). Ne renvoie jamais le hash.
-- ⚠️ SÉCURITÉ : supporte bcrypt (nouveau) ET SHA-256 (legacy)
create or replace function public.verify_couple_pin(p_profile_id uuid, p_pin text)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
  v_hash text;
begin
  if p_pin is null or char_length(p_pin) <> 4 then
    return query select false;
    return;
  end if;

  SELECT pin_hash INTO v_hash FROM public.profiles WHERE id = p_profile_id;

  if v_hash is null then
    return query select false;
    return;
  end if;

  -- Nouveau format bcrypt (commence par $2)
  if v_hash LIKE '$2%' then
    return query SELECT (crypt(p_pin, v_hash) = v_hash);
    return;
  end if;

  -- Legacy SHA-256 (pour transition)
  return query
  SELECT (v_hash = encode(digest('notre-bulle-salt-' || p_pin, 'sha256'), 'hex'));
end;
$$;

-- set_couple_pin : bootstrap — crée le PIN UNIQUEMENT si aucun
-- n'existe pour ce profil. Incrémente l'epoch (1er appareil = epoch 1).
-- ⚠️ SÉCURITÉ : utilise bcrypt au lieu de SHA-256
create or replace function public.set_couple_pin(p_profile_id uuid, p_pin text)
returns table(ok boolean, session_epoch int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_epoch int;
  new_hash  text;
begin
  if p_pin is null or char_length(p_pin) <> 4 then
    return query select false, 0;
    return;
  end if;

  -- Refuser si un PIN existe déjà (impossible d'en créer un autre)
  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.pin_hash is not null) then
    return query select false, coalesce((select s.session_epoch from public.couple_sessions s where s.profile_id = p_profile_id), 0);
    return;
  end if;

  -- ⚠️ BCRYPT : sel aléatoire + 12 rounds de cost
  new_hash := crypt(p_pin, gen_salt('bf', 12));

  update public.profiles p
     set pin_hash    = new_hash,
         updated_at  = now()
   where p.id = p_profile_id;

  if not found then
    return query select false, 0;
    return;
  end if;

  insert into public.couple_sessions(profile_id, session_epoch)
  values (p_profile_id, 1)
  on conflict (profile_id) do update
    set session_epoch = public.couple_sessions.session_epoch + 1,
        updated_at    = now()
  returning public.couple_sessions.session_epoch into new_epoch;

  return query select true, new_epoch;
end;
$$;

-- login_couple_pin : vérifie le PIN ET force la déconnexion des
-- autres appareils de ce profil (incrémentation de l'epoch).
-- ⚠️ SÉCURITÉ : supporte bcrypt (nouveau) ET SHA-256 (legacy)
create or replace function public.login_couple_pin(p_profile_id uuid, p_pin text)
returns table(ok boolean, session_epoch int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash    text;
  valid     boolean := false;
  new_epoch int;
begin
  SELECT pin_hash INTO v_hash FROM public.profiles WHERE id = p_profile_id;

  if v_hash is null then
    return query select false, 0;
    return;
  end if;

  -- Nouveau format bcrypt
  if v_hash LIKE '$2%' then
    valid := (crypt(p_pin, v_hash) = v_hash);
  else
    -- Legacy SHA-256
    valid := (v_hash = encode(digest('notre-bulle-salt-' || p_pin, 'sha256'), 'hex'));
    -- Migration automatique : si le PIN est correct en SHA-256,
    -- on le re-hash en bcrypt pour les prochaines fois
    if valid then
      UPDATE public.profiles SET pin_hash = crypt(p_pin, gen_salt('bf', 12)) WHERE id = p_profile_id;
    end if;
  end if;

  if not valid then
    return query select false, 0;
    return;
  end if;

  insert into public.couple_sessions(profile_id, session_epoch)
  values (p_profile_id, 1)
  on conflict (profile_id) do update
    set session_epoch = public.couple_sessions.session_epoch + 1,
        updated_at    = now()
  returning public.couple_sessions.session_epoch into new_epoch;

  return query select true, new_epoch;
end;
$$;

-- change_couple_pin : exige l'ancien PIN, fixe le nouveau, et force
-- la reconnexion de tous les appareils de ce profil (epoch++).
-- ⚠️ SÉCURITÉ : le nouveau PIN est hashé en bcrypt
create or replace function public.change_couple_pin(p_profile_id uuid, p_old_pin text, p_new_pin text)
returns table(ok boolean, session_epoch int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash    text;
  valid     boolean := false;
  new_epoch int;
begin
  if p_new_pin is null or char_length(p_new_pin) <> 4 then
    return query select false, 0;
    return;
  end if;

  SELECT pin_hash INTO v_hash FROM public.profiles WHERE id = p_profile_id;

  if v_hash is null then
    return query select false, 0;
    return;
  end if;

  -- Vérifier l'ancien PIN (supporte bcrypt + SHA-256 legacy)
  if v_hash LIKE '$2%' then
    valid := (crypt(p_old_pin, v_hash) = v_hash);
  else
    valid := (v_hash = encode(digest('notre-bulle-salt-' || p_old_pin, 'sha256'), 'hex'));
  end if;

  if not valid then
    return query select false, 0;
    return;
  end if;

  -- Nouveau PIN toujours en bcrypt
  update public.profiles p
     set pin_hash    = crypt(p_new_pin, gen_salt('bf', 12)),
         updated_at  = now()
   where p.id = p_profile_id;

  insert into public.couple_sessions(profile_id, session_epoch)
  values (p_profile_id, 1)
  on conflict (profile_id) do update
    set session_epoch = public.couple_sessions.session_epoch + 1,
        updated_at    = now()
  returning public.couple_sessions.session_epoch into new_epoch;

  return query select true, new_epoch;
end;
$$;

-- 6. Autoriser l'API REST anon à appeler ces fonctions
--    (sans jamais exposer le hash lui-même)
grant execute on function public.get_couple_auth_state(uuid) to anon;
grant execute on function public.verify_couple_pin(uuid, text) to anon;
grant execute on function public.set_couple_pin(uuid, text) to anon;
grant execute on function public.login_couple_pin(uuid, text) to anon;
grant execute on function public.change_couple_pin(uuid, text, text) to anon;
