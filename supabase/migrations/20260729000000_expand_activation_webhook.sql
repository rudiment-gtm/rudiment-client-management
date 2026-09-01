-- Expands the lead-to-active webhook to also fire on canceled-to-active
-- (a win-back), not just lead-to-active (a conversion). Replaces the
-- narrower accounts_lead_to_active_notify trigger from the prior migration.

drop trigger if exists accounts_lead_to_active_notify on accounts;
drop function if exists notify_account_lead_to_active();

create or replace function notify_account_activated()
returns trigger as $$
begin
  if new.account_status = 'active' and old.account_status in ('lead', 'canceled') then
    perform net.http_post(
      url := 'https://vyewakyciuhlrgzmxkwk.supabase.co/functions/v1/notify-n8n-status-change',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('account_id', new.id, 'from_status', old.account_status)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists accounts_activated_notify on accounts;
create trigger accounts_activated_notify
  after update of account_status on accounts
  for each row
  when (old.account_status is distinct from new.account_status)
  execute function notify_account_activated();
