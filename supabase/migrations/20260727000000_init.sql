-- ProYard Sales Map — initial schema.
-- Fresh design (not a port of Smart Route's migration history): accounts
-- carry a parent name + multi-select services + two distinct addresses +
-- a full QB-derived contact shape, with HubSpot as the CRM of record.
--
-- Idempotent: safe to run multiple times (e.g. after a partial failure) —
-- every CREATE is guarded so re-running picks up wherever it left off.

-- ── Shared infra ──────────────────────────────────────────────────────────

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Gates RLS on every table below. Update the domain list for your team.
-- Cyber Halo fork: gated to their confirmed domain (halo-cyber.ai) plus
-- getrudiment.com so Rudiment staff can still support the account.
-- m5svcs.com (the original M5 Services domain) intentionally dropped.
create or replace function has_allowed_email_domain()
returns boolean as $$
  select coalesce(
    (auth.jwt() ->> 'email') ~* '@(halo-cyber\.ai|getrudiment\.com)$',
    false
  );
$$ language sql stable security definer set search_path = public;

revoke execute on function has_allowed_email_domain() from anon, public;
grant execute on function has_allowed_email_domain() to authenticated;

-- ── profiles (auth) ───────────────────────────────────────────────────────

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  advanced_filters jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles self access" on profiles;
create policy "profiles self access" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at_column();

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function handle_new_user() from anon, authenticated, public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── accounts ──────────────────────────────────────────────────────────────

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  account_name text not null,
  account_notes text,

  -- Services (subset of buildingEngineering/facilitySolutions/janitorial/specialProjects/landscape).
  -- "Full Service" is derived client-side when all 5 are present, not stored.
  services text[] not null default '{}',

  -- Status
  account_status text not null default 'lead'
    check (account_status in ('lead', 'active', 'canceled', 'new_customer')),
  cancel_date date,

  -- Two distinct addresses: billing vs. the property/job site the rep drives to
  billing_address text, billing_city text, billing_state text, billing_zip text,
  route_address text, route_city text, route_state text, route_zip text,

  -- Map coordinates, geocoded from the route (job-site) address
  latitude double precision,
  longitude double precision,

  -- Contact
  salutation text,
  first_name text, middle_initial text, last_name text,
  primary_contact text,
  secondary_contact text,
  job_title text,
  main_phone text, alt_phone text, fax text,
  main_email text,
  linkedin_url text,
  website text,

  -- Activity
  visit_count integer not null default 0,
  last_visit_date date,
  next_follow_up_date date,
  last_contacted_at timestamptz,
  last_contacted_source text,

  -- HubSpot sync
  hubspot_company_id text,
  hubspot_contact_id text,

  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (account_name, route_address)
);

create index if not exists accounts_status_idx on accounts (account_status);
create index if not exists accounts_services_idx on accounts using gin (services);
create index if not exists accounts_hubspot_company_idx on accounts (hubspot_company_id);

alter table accounts enable row level security;

drop policy if exists "accounts allowed domain read" on accounts;
create policy "accounts allowed domain read" on accounts
  for select using (has_allowed_email_domain());
drop policy if exists "accounts allowed domain write" on accounts;
create policy "accounts allowed domain write" on accounts
  for insert with check (has_allowed_email_domain());
drop policy if exists "accounts allowed domain update" on accounts;
create policy "accounts allowed domain update" on accounts
  for update using (has_allowed_email_domain());
drop policy if exists "accounts allowed domain delete" on accounts;
create policy "accounts allowed domain delete" on accounts
  for delete using (has_allowed_email_domain());

drop trigger if exists accounts_updated_at on accounts;
create trigger accounts_updated_at before update on accounts
  for each row execute function update_updated_at_column();

-- ── account_notes (rich notes thread — separate from the single accounts.account_notes field) ──

create table if not exists account_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  note_text text not null,
  author_name text,
  author_user_id uuid references auth.users(id),
  hubspot_synced boolean not null default false,
  hubspot_id text,
  hubspot_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table account_notes enable row level security;
drop policy if exists "account_notes allowed domain all" on account_notes;
create policy "account_notes allowed domain all" on account_notes
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

-- ── account_events (visit/activity log) ──────────────────────────────────

create table if not exists account_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  event_type text not null default 'visit',
  event_medium text check (event_medium in ('In-Person', 'Phone Call', 'Video Call', 'Email', 'Text', 'Other')),
  notes text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  assigned_to text not null,
  author_user_id uuid references auth.users(id),
  author_name text,
  hubspot_id text,
  hubspot_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table account_events enable row level security;
drop policy if exists "account_events allowed domain all" on account_events;
create policy "account_events allowed domain all" on account_events
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

-- ── quotes ────────────────────────────────────────────────────────────────

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  amount numeric not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'declined', 'completed')),
  description text,
  valid_until date,
  hubspot_quote_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotes enable row level security;
drop policy if exists "quotes allowed domain all" on quotes;
create policy "quotes allowed domain all" on quotes
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

drop trigger if exists quotes_updated_at on quotes;
create trigger quotes_updated_at before update on quotes
  for each row execute function update_updated_at_column();

-- ── routing: saved + shared routes ────────────────────────────────────────

create table if not exists saved_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  stops jsonb not null,
  origin jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table saved_routes enable row level security;
drop policy if exists "saved_routes owner only" on saved_routes;
create policy "saved_routes owner only" on saved_routes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists saved_routes_updated_at on saved_routes;
create trigger saved_routes_updated_at before update on saved_routes
  for each row execute function update_updated_at_column();

create or replace function generate_route_share_code()
returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  exists_already boolean;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from shared_routes where shared_routes.code = code) into exists_already;
    exit when not exists_already;
  end loop;
  return code;
end;
$$ language plpgsql;

create table if not exists shared_routes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default generate_route_share_code(),
  created_by uuid not null references auth.users(id) on delete cascade,
  stops jsonb not null,
  origin jsonb,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table shared_routes enable row level security;
drop policy if exists "shared_routes read if allowed domain and not expired" on shared_routes;
create policy "shared_routes read if allowed domain and not expired" on shared_routes
  for select using (has_allowed_email_domain() and expires_at > now());
drop policy if exists "shared_routes insert as self" on shared_routes;
create policy "shared_routes insert as self" on shared_routes
  for insert with check (auth.uid() = created_by);
drop policy if exists "shared_routes delete own" on shared_routes;
create policy "shared_routes delete own" on shared_routes
  for delete using (auth.uid() = created_by);

drop trigger if exists shared_routes_updated_at on shared_routes;
create trigger shared_routes_updated_at before update on shared_routes
  for each row execute function update_updated_at_column();

-- ── sync logs ─────────────────────────────────────────────────────────────

create table if not exists hubspot_sync_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  action text not null,
  status text not null check (status in ('ok', 'matched', 'error')),
  hubspot_id text,
  matched_owner_id text,
  error_message text,
  request_payload jsonb,
  response_payload jsonb,
  invoked_by_email text,
  created_at timestamptz not null default now()
);

alter table hubspot_sync_log enable row level security;
drop policy if exists "hubspot_sync_log read allowed domain" on hubspot_sync_log;
create policy "hubspot_sync_log read allowed domain" on hubspot_sync_log
  for select using (has_allowed_email_domain());
-- writes are service-role only (edge functions) — no insert/update policy for client roles

create table if not exists clay_sync_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  rows_received integer,
  rows_after_dedupe integer,
  dropped_duplicates integer,
  would_be_updates integer,
  inserted integer,
  updated integer,
  geocoded integer,
  validation_errors jsonb,
  update_errors jsonb,
  http_status integer,
  source_ip text,
  user_agent text,
  notes text,
  created_at timestamptz not null default now()
);

alter table clay_sync_log enable row level security;
drop policy if exists "clay_sync_log read allowed domain" on clay_sync_log;
create policy "clay_sync_log read allowed domain" on clay_sync_log
  for select using (has_allowed_email_domain());
