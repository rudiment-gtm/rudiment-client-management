-- Simulated plan tiers for the sales-demo PLG flow — no real billing behind
-- this, just enough to demo what plan-gated CRM Sync would look like.
-- trial_ends_at is set for every new profile (including internal
-- @getrudiment.com logins) since it's harmless there — they don't hit the
-- CRM Sync gate unless a rep manually flips their own plan_tier for a demo.

alter table profiles
  add column if not exists plan_tier text not null default 'trial'
    check (plan_tier in ('trial', 'base', 'standard', 'growth')),
  add column if not exists trial_ends_at timestamptz;

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, display_name, trial_ends_at)
  values (new.id, new.raw_user_meta_data ->> 'display_name', now() + interval '14 days');
  return new;
end;
$$ language plpgsql security definer set search_path = public;
