-- "Quote Created" event type: adds service/price fields to account_events
-- and auto-generates a human-readable, collision-safe quote number
-- ("{Account Name} {Year} SOS", disambiguated with " (2)", " (3)"... if the
-- same client is quoted more than once in the same year). Fires a webhook
-- to n8n (Google Doc template + Slack notification) on insert.

alter table account_events
  add column if not exists quote_services text[],
  add column if not exists quote_price_usd numeric,
  add column if not exists quote_number text;

create or replace function generate_quote_number()
returns trigger as $$
declare
  acct_name text;
  base text;
  candidate text;
  suffix int := 1;
begin
  if new.event_type <> 'Quote Created' or new.quote_number is not null then
    return new;
  end if;

  select account_name into acct_name from accounts where id = new.account_id;
  base := coalesce(acct_name, 'Unknown') || ' ' || extract(year from now())::text || ' SOS';
  candidate := base;

  while exists (select 1 from account_events where quote_number = candidate) loop
    suffix := suffix + 1;
    candidate := base || ' (' || suffix || ')';
  end loop;

  new.quote_number := candidate;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists account_events_generate_quote_number on account_events;
create trigger account_events_generate_quote_number
  before insert on account_events
  for each row
  execute function generate_quote_number();

create or replace function notify_quote_created()
returns trigger as $$
begin
  if new.event_type = 'Quote Created' then
    perform net.http_post(
      url := 'https://vyewakyciuhlrgzmxkwk.supabase.co/functions/v1/notify-n8n-quote-created',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('event_id', new.id)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists account_events_quote_created_notify on account_events;
create trigger account_events_quote_created_notify
  after insert on account_events
  for each row
  execute function notify_quote_created();
