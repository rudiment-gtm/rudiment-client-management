-- ── Internal ops tracker: Projects, Meetings, standalone Tasks ───────────
-- Replaces the Map/Leads/Workflows/Sequences/Replies feature set in the UI
-- with a lightweight internal tracker: a spreadsheet-style project tracker
-- (project_sections/project_items), a simple meeting-notes doc (meetings),
-- and a standalone task list (internal_tasks) no longer tied to accounts.

create table if not exists project_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_sections enable row level security;
drop policy if exists "project_sections allowed domain all" on project_sections;
create policy "project_sections allowed domain all" on project_sections
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

drop trigger if exists project_sections_updated_at on project_sections;
create trigger project_sections_updated_at before update on project_sections
  for each row execute function update_updated_at_column();

create table if not exists project_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references project_sections(id) on delete cascade,
  description text not null default '',
  status text not null default 'P1 - Priority'
    check (status in ('P1 - Priority', 'P2 - High', 'P3 - Normal', 'P4 - Nice to Have')),
  start_date date,
  completion_target_date date,
  assigned_by text,
  owner text,
  percent_complete int check (percent_complete between 0 and 100),
  complete_status text not null default 'Not Started'
    check (complete_status in ('Not Started', 'In Progress', 'In Review', 'Completed', 'Blocked')),
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_items enable row level security;
drop policy if exists "project_items allowed domain all" on project_items;
create policy "project_items allowed domain all" on project_items
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

create index if not exists project_items_section_position_idx on project_items (section_id, position);

drop trigger if exists project_items_updated_at on project_items;
create trigger project_items_updated_at before update on project_items
  for each row execute function update_updated_at_column();

create table if not exists internal_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  due_date date,
  owner text,
  status text not null default 'Not Started' check (status in ('Not Started', 'In Progress', 'Done')),
  created_by uuid references auth.users(id),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table internal_tasks enable row level security;
drop policy if exists "internal_tasks allowed domain all" on internal_tasks;
create policy "internal_tasks allowed domain all" on internal_tasks
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

create index if not exists internal_tasks_status_due_idx on internal_tasks (status, due_date);

drop trigger if exists internal_tasks_updated_at on internal_tasks;
create trigger internal_tasks_updated_at before update on internal_tasks
  for each row execute function update_updated_at_column();

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled meeting',
  meeting_date date not null default current_date,
  attendees text,
  content_html text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table meetings enable row level security;
drop policy if exists "meetings allowed domain all" on meetings;
create policy "meetings allowed domain all" on meetings
  for all using (has_allowed_email_domain()) with check (has_allowed_email_domain());

drop trigger if exists meetings_updated_at on meetings;
create trigger meetings_updated_at before update on meetings
  for each row execute function update_updated_at_column();

-- ── Seed: recreate the team's existing project tracker spreadsheet ───────

do $$
declare
  v_list_building uuid;
  v_data_enrichment uuid;
  v_outbound uuid;
  v_events uuid;
  v_special_projects uuid;
begin
  -- Guard so re-running this migration (or applying it to a DB that already
  -- has sections) never duplicates the seed data.
  if exists (select 1 from project_sections) then
    return;
  end if;

  insert into project_sections (name, position) values ('List Building', 0) returning id into v_list_building;
  insert into project_sections (name, position) values ('Data Enrichment', 1) returning id into v_data_enrichment;
  insert into project_sections (name, position) values ('Outbound', 2) returning id into v_outbound;
  insert into project_sections (name, position) values ('Events', 3) returning id into v_events;
  insert into project_sections (name, position) values ('Special Projects', 4) returning id into v_special_projects;

  -- List Building
  insert into project_items (section_id, description, status, percent_complete, complete_status, position) values
    (v_list_building, '', 'P1 - Priority', 100, 'Not Started', 0),
    (v_list_building, '', 'P1 - Priority', 100, 'Not Started', 1),
    (v_list_building, '', 'P1 - Priority', null, 'Not Started', 2);

  -- Data Enrichment
  insert into project_items (section_id, description, status, owner, percent_complete, complete_status, position) values
    (v_data_enrichment, '', 'P1 - Priority', 'Robert', 100, 'Not Started', 0),
    (v_data_enrichment, '', 'P1 - Priority', 'Ani', 100, 'Not Started', 1),
    (v_data_enrichment, '', 'P1 - Priority', 'Ani', 100, 'Not Started', 2),
    (v_data_enrichment, '', 'P1 - Priority', 'Ani', 100, 'Not Started', 3),
    (v_data_enrichment, '', 'P1 - Priority', 'Ani', 100, 'Not Started', 4),
    (v_data_enrichment, '', 'P1 - Priority', 'Ani', 100, 'Not Started', 5),
    (v_data_enrichment, '', 'P1 - Priority', 'Ani', 100, 'Not Started', 6),
    (v_data_enrichment, '', 'P1 - Priority', 'George', null, 'Not Started', 7),
    (v_data_enrichment, '', 'P1 - Priority', 'George', null, 'Not Started', 8);

  -- Outbound (all blank)
  insert into project_items (section_id, description, status, percent_complete, complete_status, position) values
    (v_outbound, '', 'P1 - Priority', null, 'Not Started', 0),
    (v_outbound, '', 'P1 - Priority', null, 'Not Started', 1),
    (v_outbound, '', 'P1 - Priority', null, 'Not Started', 2),
    (v_outbound, '', 'P1 - Priority', null, 'Not Started', 3),
    (v_outbound, '', 'P1 - Priority', null, 'Not Started', 4),
    (v_outbound, '', 'P1 - Priority', null, 'Not Started', 5),
    (v_outbound, '', 'P1 - Priority', null, 'Not Started', 6);

  -- Events
  insert into project_items (section_id, description, status, owner, percent_complete, complete_status, position) values
    (v_events, '', 'P1 - Priority', 'Ani', null, 'Not Started', 0),
    (v_events, '', 'P1 - Priority', null, null, 'Not Started', 1),
    (v_events, '', 'P1 - Priority', null, null, 'Not Started', 2),
    (v_events, '', 'P1 - Priority', null, null, 'Not Started', 3),
    (v_events, '', 'P1 - Priority', null, null, 'Not Started', 4),
    (v_events, '', 'P1 - Priority', null, null, 'Not Started', 5);

  -- Special Projects (all blank)
  insert into project_items (section_id, description, status, percent_complete, complete_status, position) values
    (v_special_projects, '', 'P1 - Priority', null, 'Not Started', 0),
    (v_special_projects, '', 'P1 - Priority', null, 'Not Started', 1),
    (v_special_projects, '', 'P1 - Priority', null, 'Not Started', 2),
    (v_special_projects, '', 'P1 - Priority', null, 'Not Started', 3),
    (v_special_projects, '', 'P1 - Priority', null, 'Not Started', 4),
    (v_special_projects, '', 'P1 - Priority', null, 'Not Started', 5),
    (v_special_projects, '', 'P1 - Priority', null, 'Not Started', 6);
end $$;
