-- ── Workflows engine ────────────────────────────────────────────────────
-- A real, running automation system backed entirely by Postgres:
--   1. Triggers on accounts/account_events/account_tags write a lightweight
--      event row to workflow_trigger_events whenever something relevant
--      happens.
--   2. pg_cron calls the process-workflows edge function on a schedule.
--      That function (a) matches new trigger events against active
--      workflows' trigger_type + conditions, starting a workflow_run when
--      one matches, (b) sweeps for the purely time-based triggers
--      (no_activity_days, follow_up_due) that can't be a row-insert
--      trigger, and (c) advances every workflow_run whose next_run_at has
--      passed, executing steps (wait/task/tag/status/alert/nurture) until
--      it hits a wait step or runs out of steps.
-- Nothing here is a simulation — task creation, tag/status changes, and the
-- wait timing are all real. Only the Slack/Instantly *send* is stubbed
-- (logged to workflow_alert_log) until those integrations are connected;
-- once integration_connections has a row for a provider, the same engine
-- sends for real instead of logging.

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active')),
  trigger_type text not null
    check (trigger_type in (
      'tag_added', 'status_changed', 'activity_logged',
      'no_activity_days', 'follow_up_due', 'account_imported'
    )),
  trigger_config jsonb not null default '{}',
  -- FilterGroup[]-shaped, same as the map toolbar's advanced filters, but
  -- restricted to fields the workflow conditions card exposes (status,
  -- tags, lastActivityType, city).
  conditions jsonb not null default '[]',
  -- Ordered array of {type: 'wait'|'alert'|'nurture'|'task'|'tag'|'status'|'outbound', ...config}
  steps jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workflows enable row level security;
drop policy if exists "workflows allowed domain all" on workflows;
create policy "workflows allowed domain all" on workflows
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

drop trigger if exists workflows_updated_at on workflows;
create trigger workflows_updated_at before update on workflows
  for each row execute function update_updated_at_column();

-- One row per account currently progressing through a workflow.
create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  step_index int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'canceled')),
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workflow_runs enable row level security;
drop policy if exists "workflow_runs allowed domain all" on workflow_runs;
create policy "workflow_runs allowed domain all" on workflow_runs
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

-- Only one active run per (workflow, account) at a time.
create unique index if not exists workflow_runs_one_pending_idx
  on workflow_runs (workflow_id, account_id) where (status = 'pending');

create index if not exists workflow_runs_due_idx on workflow_runs (next_run_at) where (status = 'pending');

drop trigger if exists workflow_runs_updated_at on workflow_runs;
create trigger workflow_runs_updated_at before update on workflow_runs
  for each row execute function update_updated_at_column();

-- Where workflow output lands — the Tasks view reads straight from here.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  workflow_id uuid references workflows(id) on delete set null,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  title text not null,
  subtitle text,
  owner text,
  due_at timestamptz not null default now(),
  status text not null default 'upcoming' check (status in ('upcoming', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;
drop policy if exists "tasks allowed domain all" on tasks;
create policy "tasks allowed domain all" on tasks
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

create index if not exists tasks_status_due_idx on tasks (status, due_at);

-- Lightweight event log the DB triggers write to; process-workflows
-- consumes and marks these processed rather than acting inline in the
-- trigger itself, keeping the actual UPDATE/INSERT that caused it fast.
create table if not exists workflow_trigger_events (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null,
  account_id uuid not null references accounts(id) on delete cascade,
  payload jsonb not null default '{}',
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table workflow_trigger_events enable row level security;
drop policy if exists "workflow_trigger_events allowed domain all" on workflow_trigger_events;
create policy "workflow_trigger_events allowed domain all" on workflow_trigger_events
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

create index if not exists workflow_trigger_events_unprocessed_idx
  on workflow_trigger_events (processed, created_at) where (processed = false);

-- Stubbed Slack/email/nurture sends land here until a real provider is
-- connected (see integration_connections below).
create table if not exists workflow_alert_log (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid references workflow_runs(id) on delete cascade,
  channel text not null,
  message text not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table workflow_alert_log enable row level security;
drop policy if exists "workflow_alert_log allowed domain all" on workflow_alert_log;
create policy "workflow_alert_log allowed domain all" on workflow_alert_log
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

-- Forward-compatible connection store — empty today. Once Slack OAuth (or
-- an Instantly API key) is actually wired up, the connect flow inserts a
-- row here and process-workflows starts sending for real instead of
-- logging to workflow_alert_log, with no engine changes needed.
create table if not exists integration_connections (
  provider text primary key check (provider in ('slack', 'instantly')),
  config jsonb not null default '{}',
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table integration_connections enable row level security;
drop policy if exists "integration_connections allowed domain all" on integration_connections;
create policy "integration_connections allowed domain all" on integration_connections
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

-- ── Event-driven trigger writers ─────────────────────────────────────────

create or replace function notify_workflow_status_changed()
returns trigger as $$
begin
  insert into workflow_trigger_events (trigger_type, account_id, payload)
  values ('status_changed', new.id, jsonb_build_object('from', old.account_status, 'to', new.account_status));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists workflow_status_changed on accounts;
create trigger workflow_status_changed
  after update of account_status on accounts
  for each row
  when (old.account_status is distinct from new.account_status)
  execute function notify_workflow_status_changed();

create or replace function notify_workflow_account_imported()
returns trigger as $$
begin
  insert into workflow_trigger_events (trigger_type, account_id, payload) values ('account_imported', new.id, '{}');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists workflow_account_imported on accounts;
create trigger workflow_account_imported
  after insert on accounts
  for each row execute function notify_workflow_account_imported();

create or replace function notify_workflow_activity_logged()
returns trigger as $$
begin
  insert into workflow_trigger_events (trigger_type, account_id, payload)
  values ('activity_logged', new.account_id, jsonb_build_object('event_type', new.event_type));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists workflow_activity_logged on account_events;
create trigger workflow_activity_logged
  after insert on account_events
  for each row execute function notify_workflow_activity_logged();

create or replace function notify_workflow_tag_added()
returns trigger as $$
begin
  insert into workflow_trigger_events (trigger_type, account_id, payload)
  values ('tag_added', new.account_id, jsonb_build_object('tag_id', new.tag_id));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists workflow_tag_added on account_tags;
create trigger workflow_tag_added
  after insert on account_tags
  for each row execute function notify_workflow_tag_added();

-- ── Scheduler ────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'process-workflows',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ryyfoaekvrvxobfzpvcr.supabase.co/functions/v1/process-workflows',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
