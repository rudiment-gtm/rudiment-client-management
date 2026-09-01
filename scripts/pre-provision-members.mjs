// DO NOT RUN until Ani explicitly says to. Prepared ahead of time so member
// setup is a one-command action once she gives the go-ahead — see
// SETUP_TODO.md "Members" section for the full context.
//
// Ani was explicit: mbelkin@halo-cyber.ai and tmcclafferty@halo-cyber.ai
// (both admin) should be pre-provisioned as accounts, but NOT sent any
// invite email yet. This repo's existing member-add path
// (supabase/functions/invite-member, used by useInviteMember() in the app)
// always calls `supabase.auth.admin.inviteUserByEmail(...)`, which
// unconditionally sends a real "you've been invited" email — there's no
// flag to suppress it. So that path is NOT used here.
//
// This script uses `supabase.auth.admin.createUser({ email_confirm: true })`
// instead. Per Supabase's Auth Admin API, createUser does not send any email
// on its own (unlike inviteUserByEmail) — it just creates an already-
// confirmed user record. The existing `handle_new_user()` trigger fires the
// same as it would for a real signup and creates their `profiles` row; this
// script then patches that row's role to 'admin'.
//
// Caveat worth Ani's sign-off, not just mine: because this creates the
// auth.users row directly (no password set), the user can't sign in until
// either (a) someone later sends them a password-reset / magic-link email
// (a separate, deliberate action — this script does not do it), or (b) the
// invite-member path is used on them *later* — and it's not verified here
// whether Supabase's inviteUserByEmail behaves cleanly when called against
// an email that's already a confirmed user (it may error "already
// registered" instead of sending the invite). Worth a quick real test
// against a throwaway address before relying on that as the "send it now"
// trigger later.
//
// Run with (only once Ani says go):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CONFIRM=yes node scripts/pre-provision-members.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (process.env.CONFIRM !== 'yes') {
  console.error(
    'Refusing to run: this pre-provisions real Cyber Halo admin accounts.\n' +
    'Set CONFIRM=yes only after Ani has explicitly said to go ahead.'
  );
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const MEMBERS = [
  { email: 'mbelkin@halo-cyber.ai', role: 'admin' },
  { email: 'tmcclafferty@halo-cyber.ai', role: 'admin' },
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

for (const { email, role } of MEMBERS) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // marks the email verified; does NOT send mail
  });
  if (error) {
    console.error(`Failed to create ${email}:`, error.message);
    continue;
  }
  const userId = data.user.id;
  const { error: roleError } = await supabase
    .from('profiles')
    .update({ role })
    .eq('user_id', userId);
  if (roleError) {
    console.error(`Created ${email} (${userId}) but failed to set role:`, roleError.message);
  } else {
    console.log(`Pre-provisioned ${email} (${userId}) as ${role}. No email sent.`);
  }
}
