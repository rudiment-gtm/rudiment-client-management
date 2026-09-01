-- The Prospect tab's searchable "pool" of prospectable companies — separate
-- from `accounts` (the real pipeline/CRM data) so browsing/filtering never
-- touches the live map until a rep explicitly pushes a company onto it.
-- Self-contained fictional demo data (seeded by scripts/seed-prospect-pool.mjs)
-- plus whatever a rep imports via CSV (source = 'import').

create table if not exists prospect_pool_companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  category text,
  address text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  website text,
  phone text,
  source text not null default 'seed' check (source in ('seed', 'import')),
  created_at timestamptz not null default now()
);

create index if not exists prospect_pool_companies_city_idx on prospect_pool_companies (city);
create index if not exists prospect_pool_companies_category_idx on prospect_pool_companies (category);

alter table prospect_pool_companies enable row level security;
drop policy if exists "prospect_pool_companies allowed domain all" on prospect_pool_companies;
create policy "prospect_pool_companies allowed domain all" on prospect_pool_companies
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());
