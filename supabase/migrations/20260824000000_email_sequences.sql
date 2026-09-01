-- ── EmailBison sequences ─────────────────────────────────────────────────
-- A rep builds this entirely inside Encore — name, audience filter (same
-- FilterGroup[] shape the map toolbar/list view already use), and a
-- multi-step email sequence. "Save" creates/updates the real campaign +
-- sequence content in EmailBison via the emailbison-save-sequence edge
-- function; "Push" resolves the filter against current accounts and adds
-- the matching leads to that same EmailBison campaign via
-- emailbison-push-leads. The account never sees EmailBison — to them this
-- is just "Sequences" in Encore, but the sending itself runs entirely on
-- EmailBison's infrastructure.

create table if not exists email_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active')),

  -- FilterGroup[] — identical shape to the map toolbar's advancedFilters,
  -- evaluated client-side against accounts via evaluateFilters() to build
  -- the push list.
  filter_groups jsonb not null default '[]',

  -- [{ subject, body, waitDays, emailbisonStepId? }] — emailbisonStepId is
  -- filled in after the first save so subsequent saves can update steps in
  -- place instead of recreating them.
  steps jsonb not null default '[]',

  -- Set once the campaign/sequence actually exist in EmailBison (after the
  -- first Save). Null until then — Push is disabled until these are set.
  emailbison_campaign_id integer,
  emailbison_sequence_id integer,

  last_pushed_lead_count integer,
  last_pushed_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_sequences enable row level security;
drop policy if exists "email_sequences allowed domain all" on email_sequences;
create policy "email_sequences allowed domain all" on email_sequences
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

drop trigger if exists email_sequences_updated_at on email_sequences;
create trigger email_sequences_updated_at before update on email_sequences
  for each row execute function update_updated_at_column();
