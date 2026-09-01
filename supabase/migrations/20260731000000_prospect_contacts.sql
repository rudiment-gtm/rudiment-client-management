-- Saved prospect contacts (people found via LeadMagic, tied to an account) —
-- backs the Prospect and Contacts tabs. Unlike the original demo prototype
-- (which stored these in browser localStorage, per-session, per-browser),
-- this is real, shared, persistent storage.

create table if not exists prospect_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  title text,
  linkedin_url text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table prospect_contacts enable row level security;
drop policy if exists "prospect_contacts allowed domain all" on prospect_contacts;
create policy "prospect_contacts allowed domain all" on prospect_contacts
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());
