// Public PLG signup — collects an email from the /get-started page (no auth
// required to call this) and:
//   1. logs it in plg_signups so the lead is kept even if they never click
//      through the invite email
//   2. sends Supabase's own invite email via the service-role client, which
//      creates the auth user and lets them finish signing in from the link
//
// This is a sales-demo simulation, not a real multi-tenant signup — everyone
// who accepts the invite lands in the same shared demo data as every other
// @getrudiment.com login. handle_new_user() already sets plan_tier='trial'
// and a 14-day trial_ends_at for every new profile, including these.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo } = await req.json();

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
      return new Response(JSON.stringify({ error: 'Signup is not configured yet' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Lead capture first, independent of whether the invite send succeeds —
    // an email typo or an already-registered user shouldn't lose the lead.
    const { error: leadError } = await supabase.from('plg_signups').insert({ email });
    if (leadError) console.error('plg_signups insert failed:', leadError.message);

    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo || undefined,
    });

    if (inviteError) {
      // Someone re-submitting an email that already has an account isn't a
      // real failure from the user's point of view — the lead is captured
      // either way and they already have a way in (their existing account).
      const alreadyExists = /already registered|already exists/i.test(inviteError.message);
      if (!alreadyExists) {
        console.error('inviteUserByEmail failed:', inviteError.message);
        return new Response(JSON.stringify({ error: 'Could not send the signup email' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('plg-signup error:', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: 'Request failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
