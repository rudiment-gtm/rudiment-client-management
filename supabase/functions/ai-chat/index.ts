// Chat backend for Rudi — the client-facing concierge in the "Rudi" tab.
// Answers questions about how the client's campaigns are performing (from
// real EmailBison data when it's connected) and drafts a message for the
// team when the client wants something looked at or fixed (the client
// confirms and sends it themselves via the "Send to team" button, which
// calls the notify-team function).
//
// Set the API key as a Supabase Edge Function secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.115.0";
import { emailBisonConfigured, listCampaigns } from "../_shared/emailbison.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const MAX_TOKENS = 2048;
const DEFAULT_MODEL = "claude-sonnet-5";
// Cap how much raw EmailBison JSON gets relayed into the prompt so a large
// campaign list can't blow out the context window.
const MAX_GROUNDING_CHARS = 8000;

// Every structured-reply mode asks Claude to reply with ONLY a bare JSON
// object — but models don't always comply perfectly, and will sometimes
// prepend a plain-English restatement before the JSON anyway. Rather than
// depend on prompt wording alone, extract the first balanced {...} object
// found anywhere in the text (bracket-depth scan, string/escape aware) and
// parse that — tolerant of leading/trailing prose either way.
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// When the user asks to compare or list multiple campaigns, the system
// prompt asks Claude to reply with one bare JSON table instead of prose.
function parseTableReply(text: string) {
  const parsed = extractJsonObject(text) as { text?: string; columns?: unknown; rows?: unknown } | null;
  if (!parsed || typeof parsed.text !== "string" || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) return null;
  const columns = parsed.columns.map(String);
  const rows = parsed.rows
    .filter((r): r is unknown[] => Array.isArray(r))
    .slice(0, 20)
    .map((r) => columns.map((_, i) => String(r[i] ?? "")));
  return { text: parsed.text, columns, rows };
}

function parseRequestDraftReply(text: string) {
  const parsed = extractJsonObject(text) as { type?: string; summary?: string; message?: string } | null;
  if (parsed?.type !== "request_draft" || typeof parsed.summary !== "string" || typeof parsed.message !== "string") return null;
  return { type: "request_draft" as const, summary: parsed.summary, message: parsed.message };
}

async function buildCampaignGrounding(): Promise<string> {
  if (!emailBisonConfigured()) {
    return "Campaign data isn't connected yet (EmailBison isn't configured). Don't invent numbers — tell the user metrics aren't wired up here yet and point them to the Dashboard tab, or offer to flag it for the team.";
  }
  try {
    const raw = JSON.stringify(await listCampaigns());
    const truncated = raw.length > MAX_GROUNDING_CHARS ? raw.slice(0, MAX_GROUNDING_CHARS) + "…(truncated)" : raw;
    return `Raw campaign data from EmailBison (JSON, field names are whatever the API returned — read them as-is):\n${truncated}`;
  } catch (e) {
    console.error("[ai-chat] EmailBison fetch failed:", e instanceof Error ? e.message : e);
    return "Campaign data couldn't be loaded right now (EmailBison request failed). Don't invent numbers — tell the user you can't pull live metrics right now and point them to the Dashboard tab, or offer to flag it for the team.";
  }
}

function systemPrompt(campaignGrounding: string): string {
  return `You are Rudi, the assistant embedded in a Rudiment client's account. Rudiment runs this client's outbound GTM campaigns (cold email, list building, etc.). You're talking directly to the client. Be warm, direct, and useful — a helpful account rep, not a form.

Formatting — the chat UI renders your reply as plain text or one of two structured shapes below, never as markdown: no **bold**, no #headings, no bullet "-"/"*" lists, no "1. 2. 3." numbered lists. Keep answers concise.

You can help with two kinds of things:

1. CAMPAIGN PERFORMANCE — questions like "how are my campaigns doing", "what's performing best", "which subject line is winning", "how many replies this week". Answer only from the real data below — never invent a number, a campaign name, or a trend that isn't actually in it. If the data doesn't cover what they're asking (or isn't available at all), say so plainly, suggest checking the Dashboard tab for the full live view, and offer to flag it for the team if they want a deeper answer than you can give.

${campaignGrounding}

When the useful answer is a comparison across more than a couple of campaigns, reply with ONLY this JSON object, no prose before or after, no code fence:
{"text":"<1-2 sentence plain-text summary>","columns":["Campaign","<metric>","<metric>", "..."],"rows":[["...","...","..."]]}
Otherwise (a single number, a quick take, "what's working best", advice, anything conversational) just answer in plain text.

2. TEAM REQUESTS — when the client wants something looked at, fixed, or changed ("I need the team to fix X", "can someone update Y", "this isn't working"), or when you've told them you can't answer their metrics question yourself and they want it escalated. Ask at most one quick clarifying question ONLY if their request is too vague to act on (e.g. just "something's broken" with no detail) — otherwise go straight to drafting it, don't interrogate a request that's already clear. Once you have enough to write a clear one- or two-sentence note for the team, reply with ONLY this JSON object, no prose before or after, no code fence:
{"type":"request_draft","summary":"<1 sentence telling the client what you're about to send>","message":"<the actual note to the team — clear, specific, written like a real handoff, include anything concrete they gave you>"}
The frontend shows this as a card with a "Send to team" button — the client clicks it themselves, you don't send anything by producing this JSON. Never claim in plain text that you've already notified anyone; only the request_draft shape (followed by their click) actually does that.

For anything else — general questions about their account, how things work, small talk — just answer directly and briefly in plain text.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[ai-chat] ANTHROPIC_API_KEY is not configured");
    return json({ notConfigured: true });
  }

  const body = await req.json().catch(() => ({}));
  const messages = body?.messages;
  if (!Array.isArray(messages) || !messages.length) {
    return json({ error: "messages array is required" }, 400);
  }

  try {
    const campaignGrounding = await buildCampaignGrounding();
    const system = systemPrompt(campaignGrounding);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: body?.model || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })),
    });

    const text = response.content.find((block) => block.type === "text")?.text || "";
    const structured = parseRequestDraftReply(text) || parseTableReply(text);
    return json(structured || { text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-chat] error:", msg);
    return json({ error: msg }, 502);
  }
});
