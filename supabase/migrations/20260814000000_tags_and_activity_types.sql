-- ── tags ──────────────────────────────────────────────────────────────────
-- Custom, user-created labels shared across all accounts (a global taxonomy,
-- not per-account free text) — filterable from the map toolbar per Robert's
-- contact-drawer redesign (Change 3).

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  color text not null default '#00F0B5',
  created_at timestamptz not null default now()
);

alter table tags enable row level security;
drop policy if exists "tags allowed domain all" on tags;
create policy "tags allowed domain all" on tags
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

create table if not exists account_tags (
  account_id uuid not null references accounts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, tag_id)
);

alter table account_tags enable row level security;
drop policy if exists "account_tags allowed domain all" on account_tags;
create policy "account_tags allowed domain all" on account_tags
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

create index if not exists account_tags_tag_idx on account_tags(tag_id);

-- ── custom activity types ───────────────────────────────────────────────────
-- The built-in Activity Type options stay a hardcoded list in the app; this
-- table only holds ones reps add themselves via "Create custom activity",
-- shared the same way tags are.

create table if not exists activity_types (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

alter table activity_types enable row level security;
drop policy if exists "activity_types allowed domain all" on activity_types;
create policy "activity_types allowed domain all" on activity_types
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());
