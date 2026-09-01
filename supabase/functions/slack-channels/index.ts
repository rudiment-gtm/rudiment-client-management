// Called from the Workflows builder's Alert step to show connection status
// + a real channel picker. Requires a signed-in caller (default verify_jwt).
import { slackConfigured, listSlackChannels, getSlackTeamInfo } from "../_shared/slack.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!slackConfigured()) {
    return new Response(JSON.stringify({ connected: false, channels: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const [team, channels] = await Promise.all([getSlackTeamInfo(), listSlackChannels()]);
    return new Response(JSON.stringify({ connected: true, team: team.team, channels }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('slack-channels error:', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ connected: false, channels: [], error: 'Could not reach Slack' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
