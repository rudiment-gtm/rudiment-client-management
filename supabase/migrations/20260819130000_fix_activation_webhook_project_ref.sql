-- notify_account_activated() was left pointing at ProYard's project ref
-- (vyewakyciuhlrgzmxkwk) from Encore's original fork of ProYard's codebase.
-- Encore has its own deployed notify-n8n-status-change edge function, so
-- the trigger must call Encore's own project (ryyfoaekvrvxobfzpvcr) —
-- otherwise it invokes ProYard's deployment against Encore's account ids.

create or replace function notify_account_activated()
returns trigger as $$
begin
  if new.account_status = 'active' and old.account_status in ('lead', 'canceled') then
    perform net.http_post(
      url := 'https://ryyfoaekvrvxobfzpvcr.supabase.co/functions/v1/notify-n8n-status-change',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('account_id', new.id, 'from_status', old.account_status)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;
