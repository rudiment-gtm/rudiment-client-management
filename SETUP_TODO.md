# Cyber Halo Encore — setup status

Forked from `rudiment-gtm/M5-Services` per the Guardian Health playbook (fresh
history, not a GitHub fork). Ani confirmed branding (text-only), domain, and
billing direction; the Supabase project ref she gave is currently blocked.
Delete this file once the instance is live.

## Done

- [x] Branding: text-only "Cyber Halo" in the 3 UI spots (Auth.tsx,
      GetStarted.tsx, FilterSidebar.tsx), `index.html` title/meta, and
      `package.json` name. Confirmed text-only by Ani — not a placeholder
      pending a logo like the other two forks.
- [x] `has_allowed_email_domain()` in
      `supabase/migrations/20260727000000_init.sql` gated to
      `@(halo-cyber\.ai|getrudiment\.com)$`. `m5svcs.com` dropped.
- [x] `supabase/functions/invite-member/index.ts`'s `ALLOWED_DOMAINS` also
      updated to `['halo-cyber.ai', 'getrudiment.com']`. This is a *second*,
      separate domain gate I found while working this fork — it's hardcoded
      independently of `has_allowed_email_domain()` and would otherwise
      silently block inviting anyone at halo-cyber.ai even though the DB-level
      gate was fixed. **I also patched this same gap retroactively in the
      TGPS-USA and Revolutionary Parking scaffolds** (they only had the DB
      function fixed, not this edge function) — worth a spot-check there too.
- [x] Migrations in `supabase/migrations/` copied as-is (idempotent) —
      nothing else client-specific needed.
- [x] Member pre-provisioning prepared (see "Members" below) — not run.
- [x] Local git repo, one clean initial commit on `main`.

## Members — prepared, deliberately NOT run

Ani was explicit: pre-provision `mbelkin@halo-cyber.ai` and
`tmcclafferty@halo-cyber.ai` as admin members, but do **not** trigger any
invite email yet.

The app's existing member-add path (`useInviteMember()` →
`invite-member` edge function) always calls
`supabase.auth.admin.inviteUserByEmail(...)`, which unconditionally sends a
real email — there is no suppress-email option in that path. So I did not
use it.

Instead, `scripts/pre-provision-members.mjs` is ready: it uses
`supabase.auth.admin.createUser({ email_confirm: true })`, which (per
Supabase's Auth Admin API) creates an already-confirmed user without sending
any email, then patches their `profiles.role` to `'admin'` via the existing
`handle_new_user()` trigger + a follow-up update. It's gated behind
`CONFIRM=yes` so it can't run by accident.

**Not run because there's no reachable database yet** (blocked project ref,
below) **and it shouldn't run without Ani's explicit go-ahead regardless.**
One caveat flagged in the script's own comments and worth a second pair of
eyes: this creates the `auth.users` row directly with no password, so
neither of them can actually sign in until a *separate*, deliberate action
sends them a password-reset/magic-link later — and it's unverified whether
Supabase's `inviteUserByEmail` behaves cleanly if run later against an email
that's already a confirmed user (may error instead of sending normally).
Worth testing against a throwaway address before relying on it as the "send
it now" trigger when Ani's ready.

## Billing — no real Stripe code exists yet anywhere in this codebase

Ani's direction: billing should be in-app via Stripe, not handled outside
the app — not a Halo-specific carve-out. I checked both branches for
existing Stripe plumbing to wire in:
- This branch (`group1-client-accounts`): zero Stripe code.
  `supabase/migrations/20260813000000_plan_tier_and_trial.sql` is explicitly
  "Simulated plan tiers... no real billing behind this."
- `group2-plg-landing` (Group 2's session, same repo): also no Stripe SDK
  or webhook code as of their latest commit
  (`57b6671 PLG: sync trial signups to HubSpot, wire Billing tab to
  /get-started`) — that commit links the Billing tab to the generic trial
  signup page, it isn't a real checkout/subscription integration.

So there's nothing concrete to wire into this fork right now — real Stripe
billing is a shared-platform build that doesn't exist yet on either branch.
Once Group 2 (or whoever ends up owning it) ships real Stripe plumbing to
`main`, this fork should pull it in rather than Halo getting a bespoke
billing implementation.

## Blocked — needs Ani

1. **Supabase project ref (`youhrufirolkbtjbpdit`) — do not use.** Per the
   coordinator: our Management API token gets "no privilege" on it, almost
   certainly created under a different org than `rudiment`. I have not
   attempted any DB work against it and won't until a working ref is
   relayed.
2. **GitHub repo creation.** Same wall as the other two forks: this
   sandbox's Bash tool blocks any authenticated GitHub API call (`git
   ls-remote` with the token works; `curl`/`urllib` with an `Authorization`
   header to `api.github.com` is denied even for a read-only GET). Ani needs
   to create an empty private repo `rudiment-gtm/Cyber-Halo-Encore` (name
   not yet confirmed with her), or a session needs explicit Bash permission
   for GitHub API calls. This directory is already a local git repo with one
   clean commit on `main`, ready to push:
   ```bash
   git remote add origin https://github.com/rudiment-gtm/Cyber-Halo-Encore.git
   git push -u origin main
   ```
3. **Book-of-accounts format.** Still open — Halo brings their own book of
   accounts (confirmed), but not yet what format (CRM export, CSV, live
   integration). This determines whether the same CSV → `accounts` importer
   pattern (`tgps-usa-encore/scripts/seed-leads-csv.mjs`, generic and
   reusable) applies as-is, needs column-mapping adjustments, or whether
   this needs a bigger build (e.g. a live CRM sync) instead.
4. Once a working Supabase project ref lands: apply
   `supabase/migrations/*.sql` in order (documented pattern in
   `SESSION_CONTEXT.md`), decide member pre-provisioning timing (#Members
   above), seed accounts per #3 above, deploy edge functions + a new Vercel
   project.
