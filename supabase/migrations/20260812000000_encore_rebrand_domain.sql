-- Rebranded from the M5 Services client demo into Encore, a standing
-- internal demo tool. Drops the m5svcs.com login domain — Encore is not
-- tied to any specific client's staff logging in.
create or replace function has_allowed_email_domain()
returns boolean as $$
  select coalesce(
    (auth.jwt() ->> 'email') ~* '@getrudiment\.com$',
    false
  );
$$ language sql stable security definer set search_path = public;
