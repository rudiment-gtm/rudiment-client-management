-- Lead capture for the public /get-started PLG signup form — kept
-- independent of auth.users so a lead survives even if the person never
-- clicks their invite email. Insert-only from the public (anon) side;
-- only internal Rudiment logins can read the list back.

create table if not exists plg_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

alter table plg_signups enable row level security;

drop policy if exists "plg_signups public insert" on plg_signups;
create policy "plg_signups public insert" on plg_signups
  for insert to anon with check (true);

drop policy if exists "plg_signups internal read" on plg_signups;
create policy "plg_signups internal read" on plg_signups
  for select using (has_allowed_email_domain());
