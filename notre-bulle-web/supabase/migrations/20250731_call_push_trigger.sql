-- ============================================================
-- Migration : Trigger push notification d'appel entrant
-- À chaque INSERT dans la table `calls`, POST vers l'API pour
-- que le partenaire reçoive une notification + sonnerie même
-- quand l'app est fermée (Realtime ne fonctionne qu'app ouverte).
--
-- ⚠️ CONFIGURATION (obligatoire avant utilisation) :
--   L'URL de l'API et le secret ne sont PLUS en dur dans le code.
--   Ils se lisent dans les paramètres de la base (custom GUC) :
--
--   ALTER DATABASE postgres SET app.api_base_url   = 'https://<mon-domaine>.vercel.app';
--   ALTER DATABASE postgres SET app.webhook_secret = '<mon-secret>';
--
--   Valeurs de repli : https://notre-bulle-web.vercel.app et l'ancien
--   secret ci-dessous (conservés pour rétrocompatibilité).
--
-- Usage : exécuter ce fichier dans le Supabase SQL Editor.
-- ============================================================

-- 1. Activer l'extension pg_net (déjà fait si le trigger messages est en place)
create extension if not exists pg_net;

-- 2. Créer la trigger function pour les appels
create or replace function public.notify_push_on_new_call()
returns trigger
language plpgsql
security definer
as $$
declare
  payload text;
  -- URL de l'API résolue dans l'ordre :
  --   1. GUC app.api_base_url   (ex. ALTER DATABASE ... SET app.api_base_url='https://...')
  --   2. repli = l'ancienne valeur en dur (rétrocompatibilité)
  webhook_url text := coalesce(
    nullif(current_setting('app.api_base_url', true), ''),
    'https://notre-bulle-web.vercel.app'
  ) || '/api/push/on-new-call';
  -- Secret résolu dans l'ordre :
  --   1. GUC app.webhook_secret
  --   2. repli = l'ancien secret en dur (rétrocompatibilité)
  webhook_secret text := coalesce(
    nullif(current_setting('app.webhook_secret', true), ''),
    'e9ac521d-6e1d-4668-9d94-14770e6efbf3'
  );
begin
  -- Construire le payload au format attendu par l'API
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'calls',
    'schema', 'public',
    'record', row_to_json(new)::jsonb
  )::text;

  -- Envoyer la requête HTTP POST via pg_net (asynchrone)
  -- Le BEGIN/EXCEPTION garantit que même si pg_net échoue,
  -- l'insertion de l'appel n'est jamais bloquée.
  begin
    perform net.http_post(
      url := webhook_url,
      body := payload,
      headers := array[
        'Content-Type', 'application/json',
        'X-Supabase-Secret', webhook_secret
      ]
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- 3. Attacher le trigger à la table calls
drop trigger if exists on_new_call_push on public.calls;
create trigger on_new_call_push
  after insert on public.calls
  for each row
  execute function public.notify_push_on_new_call();
