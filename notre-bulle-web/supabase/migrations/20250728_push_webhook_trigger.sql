-- ============================================================
-- Migration : Trigger push notification sur INSERT messages
-- Alternative au Database Webhook (si pas disponible dans l'UI)
--
-- Active pg_net, crée une trigger function qui POST vers l'API
-- et attache le trigger à la table messages.
-- ============================================================

-- 1. Activer l'extension pg_net (HTTP requests depuis PostgreSQL)
create extension if not exists pg_net;

-- 2. Créer la trigger function
create or replace function public.notify_push_on_new_message()
returns trigger
language plpgsql
security definer
as $$
declare
  payload text;
  webhook_url text := 'https://notre-bulle.vercel.app/api/push/on-new-message';
  webhook_secret text := 'e9ac521d-6e1d-4668-9d94-14770e6efbf3'; -- à mettre à jour si changé
begin
  -- Construire le payload au format attendu par l'API (similaire au webhook Supabase)
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'messages',
    'schema', 'public',
    'record', row_to_json(new)::jsonb
  )::text;

  -- Envoyer la requête HTTP POST via pg_net (asynchrone, ne bloque pas)
  perform net.http_post(
    url := webhook_url,
    body := payload,
    headers := array[
      'Content-Type', 'application/json',
      'X-Supabase-Secret', webhook_secret
    ]
  );

  return new;
end;
$$;

-- 3. Attacher le trigger à la table messages
drop trigger if exists on_new_message_push on public.messages;
create trigger on_new_message_push
  after insert on public.messages
  for each row
  execute function public.notify_push_on_new_message();
