// Posts a client-flagged request (from Rudi, the chat tab) to the team's
// Slack. Requires a signed-in caller (default verify_jwt), same as the
// other frontend-invoked functions.
import { slackConfigured, listSlackChannels, postSlackMessage, pickDefaultChannel } from "../_shared/slack.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!slackConfigured()) {
    return json({ error: "Slack isn't connected yet — ask the team to set SLACK_BOT_TOKEN." }, 200);
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "message is required" }, 400);

  try {
    let channelId = typeof body?.channelId === "string" ? body.channelId : undefined;
    if (!channelId) {
      const channels = await listSlackChannels();
      const picked = pickDefaultChannel(channels);
      if (!picked) return json({ error: "No Slack channel available to post to." }, 200);
      channelId = picked.id;
    }
    await postSlackMessage(channelId, message);
    return json({ ok: true, channelId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notify-team] error:", msg);
    return json({ error: msg }, 502);
  }
});
