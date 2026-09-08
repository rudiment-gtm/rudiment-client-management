-- ── Client-facing pivot: Onboarding intake, Files, structured Meetings ────
-- Rudi (the chat tab) is now a client concierge rather than an internal
-- workflow/sequence/route builder. This migration adds the storage for the
-- two new pieces of that pivot:
--   1. `files` — replaces the old Projects spreadsheet tracker. Holds the
--      onboarding intake submission (one row per client, category
--      'onboarding_intake', full Q&A in `intake_data`) plus anything else
--      the team drops in for the client to review (lead lists, ad copy).
--   2. `meetings` gains four dedicated rich-text columns so every meeting
--      doc has the same fixed agenda shape (Performance / Active this week
--      / In progress / Notes) instead of one freeform blob.

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'other'
    check (category in ('onboarding_intake', 'lead_list', 'copy', 'other')),
  description text,
  content text,
  link_url text,
  intake_data jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table files enable row level security;
drop policy if exists "files allowed domain all" on files;
create policy "files allowed domain all" on files
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

create index if not exists files_category_created_idx on files (category, created_at desc);

drop trigger if exists files_updated_at on files;
create trigger files_updated_at before update on files
  for each row execute function update_updated_at_column();

alter table meetings add column if not exists performance_html text not null default '';
alter table meetings add column if not exists active_week_html text not null default '';
alter table meetings add column if not exists in_progress_html text not null default '';
alter table meetings add column if not exists notes_html text not null default '';
