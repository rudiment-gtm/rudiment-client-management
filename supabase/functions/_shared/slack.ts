// Shared Slack helpers for edge functions.
//
// Encore only ever has one Slack workspace connected (same as HubSpot's
// static-token pattern below) — a bot token set as the SLACK_BOT_TOKEN edge
// function secret, no OAuth install flow needed.

export function slackConfigured(): boolean {
  return !!Deno.env.get("SLACK_BOT_TOKEN");
}

function requireToken(): string {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured. Set it as a Supabase Edge Function secret.");
  return token;
}

async function slackFetch(method: string, body?: Record<string, unknown>) {
  const token = requireToken();
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API ${method} failed: ${data.error ?? "unknown error"}`);
  return data;
}

export interface SlackChannel {
  id: string;
  name: string;
}

export async function listSlackChannels(): Promise<SlackChannel[]> {
  const data = await slackFetch("conversations.list", { types: "public_channel,private_channel", limit: 200 });
  return (data.channels ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
}

export async function postSlackMessage(channel: string, text: string): Promise<void> {
  await slackFetch("chat.postMessage", { channel, text });
}

export async function getSlackTeamInfo(): Promise<{ team: string; team_id: string }> {
  const data = await slackFetch("auth.test");
  return { team: data.team, team_id: data.team_id };
}
