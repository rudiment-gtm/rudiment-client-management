-- Fires the notify-n8n-status-change edge function (which POSTs the full
-- account record to the n8n webhook) whenever an account's status flips
-- specifically from 'lead' to 'active' — not any other transition into
-- 'active' (e.g. canceled -> active is a win-back, not this conversion event).
--
-- Uses pg_net for a non-blocking async HTTP call so the UPDATE that changed
-- the status isn't held up waiting on n8n's response.

create extension if not exists pg_net with schema extensions;

create or replace function notify_account_lead_to_active()
returns trigger as $$
begin
  if old.account_status = 'lead' and new.account_status = 'active' then
    perform net.http_post(
      url := 'https://vyewakyciuhlrgzmxkwk.supabase.co/functions/v1/notify-n8n-status-change',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('account_id', new.id)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists accounts_lead_to_active_notify on accounts;
create trigger accounts_lead_to_active_notify
  after update of account_status on accounts
  for each row
  when (old.account_status is distinct from new.account_status)
  execute function notify_account_lead_to_active();
