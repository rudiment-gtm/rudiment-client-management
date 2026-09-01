// Settings > Members > Invite — sends a real Supabase invite email and
// records the chosen role on the new member's profile once it's created.
// Requires a signed-in caller (verify_jwt stays on, unlike plg-signup which
// is public); the actual invite send needs the service-role client since
// admin.inviteUserByEmail is a privileged Auth Admin API call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Cyber Halo fork: matches has_allowed_email_domain() in
// supabase/migrations/20260727000000_init.sql — keep these two in sync.
const ALLOWED_DOMAINS = ['halo-cyber.ai', 'getrudiment.com'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, role, redirectTo } = await req.json();

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const domain = email.split('@')[1]?.toLowerCase();
    if (!ALLOWED_DOMAINS.includes(domain)) {
      return new Response(JSON.stringify({ error: `Only ${ALLOWED_DOMAINS.map((d) => `@${d}`).join(' or ')} emails can be invited` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const chosenRole = role === 'admin' ? 'admin' : 'rep';

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
      return new Response(JSON.stringify({ error: 'Invites are not configured yet' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo || undefined,
    });

    if (inviteError) {
      console.error('inviteUserByEmail failed:', inviteError.message);
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // handle_new_user() already created the profile row (role defaults to
    // 'rep') — patch in the role the inviter actually picked.
    if (data?.user?.id && chosenRole !== 'rep') {
      const { error: roleError } = await supabase
        .from('profiles')
        .update({ role: chosenRole })
        .eq('user_id', data.user.id);
      if (roleError) console.error('Failed to set invited role:', roleError.message);
    }

    return new Response(JSON.stringify({ ok: true, user_id: data?.user?.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('invite-member error:', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: 'Request failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
