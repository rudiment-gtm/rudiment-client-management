-- ── team members / roles ────────────────────────────────────────────────
-- Settings > Members needs a real invite + role system, not a hardcoded rep
-- list. profiles already exists (one row per auth user); this adds a role
-- and opens read access to the whole internal team so the Members table and
-- Account Owner dropdowns can show everyone, not just yourself.

alter table profiles
  add column if not exists role text not null default 'rep'
    check (role in ('admin', 'rep'));

-- Split the old single "for all" self-only policy: reads are domain-wide
-- (so you can see your teammates), writes stay self-only.
drop policy if exists "profiles self access" on profiles;

create policy "profiles domain read" on profiles
  for select using (has_allowed_email_domain());

create policy "profiles self write" on profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles self update" on profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reading auth.users (for email + confirmation/invite status) isn't
-- reachable through normal RLS-safe client queries — this SECURITY DEFINER
-- function joins profiles + auth.users and returns only the safe fields the
-- Members UI needs, gated the same way every other table is.
create or replace function list_members()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.user_id,
    u.email,
    p.display_name,
    p.role,
    case when u.email_confirmed_at is not null then 'active' else 'invited' end as status,
    p.created_at
  from profiles p
  join auth.users u on u.id = p.user_id
  where has_allowed_email_domain()
  order by p.created_at asc;
$$;

revoke execute on function list_members() from anon, public;
grant execute on function list_members() to authenticated;
