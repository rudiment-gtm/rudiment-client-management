// Chat backend for the "Chat" tab — answers questions about the real
// accounts in this Supabase project (not a static demo dataset). Requires
// an authenticated rep session (default verify_jwt), same as the other
// frontend-invoked functions.
//
// Set the API key as a Supabase Edge Function secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.115.0";
import { slackConfigured, listSlackChannels } from "../_shared/slack.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

const MAX_TOKENS = 2048;
const DEFAULT_MODEL = "claude-sonnet-5";
// Cap the per-account detail dump so this stays cheap as the accounts table
// grows well beyond a handful of demo rows — aggregate counts below are
// always computed over the full table regardless of this cap.
const MAX_DETAIL_ROWS = 300;
const TABLE_COLUMNS = ["Name", "City", "Status", "Services"];

// Every structured-reply mode asks Claude to reply with ONLY a bare JSON
// object — but models don't always comply perfectly, and will sometimes
// prepend a plain-English restatement before the JSON anyway (confirmed in
// practice: "What kind of trigger...?\n\n{"type":"question",...}"). Rather
// than depend on prompt wording alone, extract the first balanced {...}
// object found anywhere in the text (bracket-depth scan, string/escape
// aware) and parse that — tolerant of leading/trailing prose either way.
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

// When the user asks a list/count/filter-style question, the system prompt
// asks Claude to reply with one bare JSON object instead of prose. Parse
// that into the shape the chat UI's table renderer expects; anything that
// isn't that exact shape is treated as an ordinary text reply.
function parseStructuredReply(text: string) {
  const parsed = extractJsonObject(text) as { text?: string; total?: number; rows?: Record<string, unknown>[] } | null;
  if (!parsed || typeof parsed.text !== "string" || !Array.isArray(parsed.rows)) return null;
  const rows = parsed.rows.slice(0, 20).map((r) => ({
    name: String(r.name ?? ""),
    city: String(r.city ?? ""),
    status: String(r.status ?? ""),
    services: String(r.services ?? "").replace(/,(?!\s)/g, ", "),
  }));
  const count = Number.isFinite(parsed.total) ? parsed.total : rows.length;
  return { text: parsed.text, rows, columns: TABLE_COLUMNS, count };
}

// Supabase's PostgREST layer hard-caps rows per request at 1000 (server-side
// db-max-rows) — passing an explicit larger Range does NOT override it, so
// a single .select() silently truncates on any table past 1000 rows (real
// accounts data, e.g. ProYard's ~2,773). Paginate in pages of that size and
// concatenate, so aggregate counts are computed over the true full table —
// capped at PAGE_SAFETY_LIMIT pages as a backstop against unbounded growth.
const PAGE_SIZE = 1000;
const PAGE_SAFETY_LIMIT = 20; // 20k rows ceiling; loop exits earlier once a page comes back short

interface AccountGroundingRow {
  account_name: string;
  account_status: string;
  services: string[] | null;
  route_city: string | null;
  route_state: string | null;
  visit_count: number | null;
  last_visit_date: string | null;
  next_follow_up_date: string | null;
  cancel_date: string | null;
}

async function fetchAllAccounts(admin: ReturnType<typeof adminClient>): Promise<AccountGroundingRow[]> {
  const columns = "account_name, account_status, services, route_city, route_state, visit_count, last_visit_date, next_follow_up_date, cancel_date";
  const rows: AccountGroundingRow[] = [];
  for (let page = 0; page < PAGE_SAFETY_LIMIT; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await admin
      .from("accounts")
      .select(columns)
      .order("account_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load accounts: ${error.message}`);
    rows.push(...((data ?? []) as unknown as AccountGroundingRow[]));
    if (!data || data.length < PAGE_SIZE) break; // last page
  }
  return rows;
}

async function buildGroundingContext(admin: ReturnType<typeof adminClient>) {
  const accounts = await fetchAllAccounts(admin);
  const total = accounts?.length ?? 0;
  const byStatus: Record<string, number> = {};
  const byService: Record<string, number> = {};
  for (const a of accounts ?? []) {
    byStatus[a.account_status] = (byStatus[a.account_status] ?? 0) + 1;
    for (const s of a.services ?? []) {
      byService[s] = (byService[s] ?? 0) + 1;
    }
  }

  const detailRows = (accounts ?? []).slice(0, MAX_DETAIL_ROWS).map((a) =>
    `${a.account_name} | ${a.account_status} | ${(a.services ?? []).join(",") || "none"} | ${a.route_city ?? "?"}, ${a.route_state ?? "?"} | visits: ${a.visit_count ?? 0} | next follow-up: ${a.next_follow_up_date ?? "none"} | cancel date: ${a.cancel_date ?? "n/a"}`
  );

  const truncatedNote = total > MAX_DETAIL_ROWS
    ? `\n(Showing the first ${MAX_DETAIL_ROWS} of ${total} accounts below — use the aggregate counts above for anything about the full set.)`
    : "";

  return `Total accounts: ${total}
By status: ${JSON.stringify(byStatus)}
By service: ${JSON.stringify(byService)}
${truncatedNote}

Each line below is: Account Name | Status | Services | City, State | visits: N | next follow-up: DATE | cancel date: DATE
${detailRows.join("\n")}`;
}

// ── Workflow build mode ──────────────────────────────────────────────────
// Spec: docs/ai-assistant-workflow-instructions.md. Grounded in the real
// schema (supabase/migrations/20260819120000_workflows.sql,
// src/types/workflow.ts) — duplicated here (not imported) because edge
// functions only bundle files under supabase/functions/.

const BUILT_IN_ACTIVITY_TYPES = [
  "Quote Created", "Call", "Drop By", "Follow up", "Presentation", "Setup",
  "First Post", "Training", "Onboarding", "Direct Hire", "Retention",
  "Expansion", "Reactivation", "Freshdesk Ticket",
];
const ACCOUNT_STATUSES = ["lead", "active", "canceled", "new_customer"];

// Shared across all three build modes — every question, open- or
// closed-ended, is asked in plain conversational text; the user types their
// answer back. Injected verbatim into each mode's system prompt.
const QUESTION_FORMAT_NOTE = `You have TWO possible reply shapes each turn — pick the right one:
1. Plain text — for every question you ask, whatever it's about, and for restating/explaining. No markdown. When you're asking the user to pick from a small set of real choices (which trigger type, which tag, which city, or a yes/no confirmation like "Save this as a draft?"), just ask it as a normal sentence and name the real options if that helps — never invent a plausible-sounding one that isn't in the real data you were given.
2. The final structured draft output — when to send it varies by mode (Workflow/Sequence wait for an explicit "yes"; Route can go straight there once it has enough to build safely — see that mode's own instructions below). Its exact shape is below in OUTPUT.
Never mix shapes in one reply — a turn is plain text, OR the final draft object, never both.
Users will often answer more than what was asked — answering a later question early, or giving more detail than the question asked for. Take that answer at face value and use it; don't make them repeat it back to you.`;

// Shared persona/tone note. You're Cue — sound like a sharp, easygoing
// colleague walking through this with them, not a form. A few real rules,
// the rest is voice, not a formula to apply identically every turn.
// Rewritten by the user (2026-08-28) — noticeably better than the prior
// version at the thing that actually mattered: it permits skipping the
// acknowledgment entirely sometimes, not just varying its wording, which
// is what actually breaks the "template" feeling. One deliberate change
// from their draft: dropped the chip "or something else" instruction —
// that line is now rendered directly by the frontend (ChatView.tsx),
// deterministically, because getting the model to reliably originate it
// itself (on the same turn as a structured chip reply) failed across
// several earlier rewrites. Asking the model to also write it would just
// produce duplicated text under every chip set.
const PERSONA_NOTE = `PERSONA — you're helping someone build a workflow, sequence, or route. Talk like a sharp coworker doing this with them, not a form reading its fields back one by one. The goal isn't a fixed voice to perform — it's to not sound like a script, turn after turn.

One thing per turn. Ask, wait for the answer, then ask the next thing. Never number a list of questions into one message. This is the one rule that actually matters mechanically — a turn with two questions in it breaks the chip flow and confuses people about what they're answering.

Don't lock into a pattern. If every reply follows the same shape — react, then ask — it reads as a template no matter how the words are dressed up, and people notice the seams fast. Some turns just ask the thing. Some react to what they heard first. Some skip the reaction entirely and move straight to the next question. Mix it up the way a person naturally would, and don't feel obligated to acknowledge every single answer — silently moving on is sometimes the more natural choice, not a gap to fill.

When you do acknowledge something, vary it. "Got it," "okay," "makes sense," "sure" — rotate between these rather than opening every turn with the same one. A repeated acknowledgment is its own tell, even if the sentence after it is fine.

Match their energy, especially when it drops. If someone's answering the same question a second or third time, or the replies get short and clipped, that's not the moment for a chattier voice — drop the acknowledgment variety and just ask the plainest possible version of the next question.

Keep it short — a sentence or two, not a paragraph. No exclamation marks doing the enthusiasm's job, no filler slang. This voice applies to every plain-text reply — never to the final draft JSON, which stays exactly that schema with zero personality in it.

For calibration, not literal phrasing to reuse — this is the register, not the words: "makes sense — one more thing..." / "save this as a draft?"`;

// Repair, recovery, and recap — added by the user (2026-08-28), new
// territory the prompt didn't cover before at all: what to do when an
// answer doesn't fit, letting someone correct an earlier answer without
// restarting, calibrating how much to recap before a confirm to how
// consequential the action is, and staying on-topic without being rigid
// about it. "Goes live" mostly means Route in this app specifically —
// Workflow and Sequence always save as a draft only, activation happens
// later as a separate explicit step — but the guidance is judgment-based
// rather than hardcoded per mode, so it doesn't need a special case here.
const REPAIR_RECOVERY_NOTE = `If an answer doesn't fit, don't just re-ask the same question. Say what you think you heard and offer one or two concrete interpretations to pick from, rather than a flat "I didn't get that." A restated guess the user can correct in one word beats making them rephrase from scratch.

Give the user a way to back up. If they say something like "wait, go back" or "actually change that," treat it as a normal move, not an edge case — update the field they're correcting and pick the conversation back up from there. Don't restart the whole flow over one correction.

Recap before anything consequential. "Save this as a draft?" can stay a plain confirm. But before an action that actually goes live and isn't reversible with an undo — overwriting an in-progress route, launching a sequence — say back the handful of choices that got made first, then ask for confirmation in plain text (e.g. "triggered by form fill, routes to the Denver rep, alerts #sales — build this?"). A yes/no confirm with no recap is fine for low-stakes saves; it's not enough right before something ships or replaces existing work. (Building a fresh route with nothing in progress to lose is its own case — see that mode's instructions for when it skips the confirm turn entirely.)

If the message isn't about building the thing, don't force it into the flow. If someone goes off-topic or is clearly testing what you'll do, answer briefly and steer back to the build (e.g. "that's outside what I can help with here — back to the workflow: ...") rather than pretending it was a valid answer to the last question.`;

interface WorkflowGrounding {
  tags: { id: string; label: string; accountCount: number }[];
  cities: string[];
  statusCounts: Record<string, number>;
  slack: { connected: boolean; channels: { id: string; name: string }[] };
}

async function buildWorkflowGrounding(admin: ReturnType<typeof adminClient>): Promise<WorkflowGrounding> {
  const [{ data: tags }, { data: cityRows }, { data: statusRows }, { data: tagLinkRows }] = await Promise.all([
    admin.from("tags").select("id, label"),
    admin.from("accounts").select("route_city").not("route_city", "is", null),
    admin.from("accounts").select("account_status"),
    admin.from("account_tags").select("tag_id"),
  ]);
  const cities = Array.from(new Set((cityRows ?? []).map((r: { route_city: string }) => r.route_city))).sort();

  const statusCounts: Record<string, number> = {};
  for (const r of (statusRows ?? []) as { account_status: string }[]) {
    statusCounts[r.account_status] = (statusCounts[r.account_status] ?? 0) + 1;
  }

  const tagCounts: Record<string, number> = {};
  for (const r of (tagLinkRows ?? []) as { tag_id: string }[]) {
    tagCounts[r.tag_id] = (tagCounts[r.tag_id] ?? 0) + 1;
  }
  const tagsWithCounts = ((tags ?? []) as { id: string; label: string }[]).map((t) => ({
    ...t,
    accountCount: tagCounts[t.id] ?? 0,
  }));

  let slack: WorkflowGrounding["slack"] = { connected: false, channels: [] };
  if (slackConfigured()) {
    try {
      slack = { connected: true, channels: await listSlackChannels() };
    } catch (e) {
      console.error("[ai-chat] slack grounding failed:", e instanceof Error ? e.message : e);
    }
  }

  return { tags: tagsWithCounts, cities, statusCounts, slack };
}

function workflowSystemPrompt(g: WorkflowGrounding): string {
  const tagsList = g.tags.length
    ? g.tags.map((t) => `${t.label} (id: ${t.id}, on ${t.accountCount} account${t.accountCount === 1 ? "" : "s"} today)`).join(", ")
    : "(no tags exist yet)";
  const citiesList = g.cities.length ? g.cities.join(", ") : "(no accounts with a city on file yet)";
  const statusCountsList = ACCOUNT_STATUSES.map((s) => `${s}: ${g.statusCounts[s] ?? 0}`).join(", ");
  const slackNote = g.slack.connected
    ? `Slack is connected. Real channels: ${g.slack.channels.map((c) => `#${c.name} (id: ${c.id})`).join(", ") || "(no channels visible)"}.`
    : "Slack is NOT connected — if the user wants a Slack alert step, tell them that needs to be connected first rather than picking a channel.";

  return `You are helping a Rudiment/Encore team member build a workflow — a REAL automation that will actually run (trigger on real account events, wait real elapsed time, create real tasks/alerts), not a mockup. Get it right rather than fast.

Formatting — the chat UI renders your reply as plain text, never as markdown: no **bold**, no #headings, no bullet "-"/"*" lists, no "1. 2. 3." numbered lists.

${QUESTION_FORMAT_NOTE}

${PERSONA_NOTE}

${REPAIR_RECOVERY_NOTE}

If the user's first message already gives you a complete trigger, any conditions, and at least one step, skip straight to restating the plan (with the live count below) and asking to save — don't force clarifying questions onto a request that's already complete, and don't invent a new optional detail to ask about just to have another question (a task step with no stated title, an alert with no stated message, etc. — fill those with the sensible defaults in STEPS below instead of asking). Otherwise ask only for what's genuinely missing, one thing at a time, per PERSONA rule 1 above — typically 2-4 questions for a vague request. Never invent a tag id, Slack channel id, or account status — only use the real ones listed below. Never suggest activating it directly; every workflow you produce saves as a draft for the user to review and turn on themselves from the Workflows tab.

REAL DATA — reference these exact values anywhere below that needs a tag or city (trigger_config.tagIds, conditions.tagIds/cities, a "tag" step's tagId). Never invent a tag or city that isn't in these lists:
Real tags: ${tagsList}
Real cities in use: ${citiesList}
Real account counts by status: ${statusCountsList}

TRIGGER TYPES (trigger_type + trigger_config) — ask which one, then the config it needs:
- tag_added — fires when a tag is added. trigger_config: { tagIds: string[] } — pick from the real tags listed above; if there's more than one, ask which by name.
- status_changed — fires when status changes. trigger_config: { statuses: string[] } — subset of: ${ACCOUNT_STATUSES.join(", ")}.
- activity_logged — fires when an activity is logged. trigger_config: { activityTypes: string[] } — subset of: ${BUILT_IN_ACTIVITY_TYPES.join(", ")}.
- no_activity_days — fires after N days of no activity. trigger_config: { days: number }.
- follow_up_due — fires when the account's follow-up date arrives. trigger_config: {} (no extra fields).
- account_imported — fires when a new account is added. trigger_config: {} (no extra fields).

CONDITIONS (optional narrowing on top of the trigger) — ask only if it isn't redundant with the trigger itself:
{ statuses?: string[], tagIds?: string[], lastActivityTypes?: string[], cities?: string[] } — tagIds/cities use the real data listed above.

STEPS (ordered array — ask "then what happens?" per step, can be more than one). Every optional field below has a sensible default — use it silently rather than asking a follow-up question about it unless the user's own wording specifically calls for something particular (e.g. they said what the task should be titled, or what the alert should say):
- { type: "wait", value: number, unit: "hours"|"days"|"weeks" }
- { type: "alert", channel: "slack"|"email"|"both", message?: string, slackChannelId?: string, slackChannelName?: string } — message supports {{account_name}}, {{status_from}}, {{status_to}}, {{activity_type}}, {{owner}}, {{workflow_name}} placeholders; default to "{{workflow_name}} fired for {{account_name}}" if the user doesn't give one. ${slackNote}
- { type: "nurture", provider: "instantly"|"encore" }
- { type: "task", title?: string } — default to a short, obvious title derived from the workflow itself (e.g. "Win-back outreach" for a canceled-status trigger) if the user didn't specify one; don't ask them to pick a title.
- { type: "tag", tagId: string } — pick from the real tags above, never invent one.
- { type: "status", status: string } — must be one of: ${ACCOUNT_STATUSES.join(", ")}.
- { type: "outbound" }

Once you have a trigger, conditions (if any), and at least one step, restate the whole thing in one or two plain-English sentences (trigger → audience → steps, in that order) and ask "Save this as a draft?" in plain text — wait for a yes before producing the OUTPUT below. When the trigger and/or conditions filter by status or tag, work out from the real counts above roughly how many accounts already qualify and say so as part of the restatement (e.g. "12 accounts are already canceled — this could fire on them today") — it's a real, useful number, not decoration. Skip this detail for trigger types you can't count from the data given (no_activity_days, activity_logged, follow_up_due, account_imported) rather than guessing a number.

OUTPUT (shape 3 — only after the yes) — reply with ONLY this JSON object, no prose before or after, no code fence. "summary" renders right above the visual trigger/step breakdown, so if you gave a live match count earlier, repeat it here too rather than leaving it only in the earlier turn:
{"type":"workflow_draft","summary":"<1-2 sentence plain-English description, including the live match count from before if there was one>","draft":{"name":"string","trigger_type":"...","trigger_config":{...},"conditions":{...},"steps":[...]}}`;
}

function parseWorkflowDraftReply(text: string) {
  const parsed = extractJsonObject(text) as { type?: string; summary?: string; draft?: Record<string, unknown> } | null;
  if (parsed?.type !== "workflow_draft" || typeof parsed.summary !== "string" || !parsed.draft) return null;
  return { type: "workflow_draft" as const, summary: parsed.summary, draft: parsed.draft };
}

// ── Sequence build mode ──────────────────────────────────────────────────
// Spec: docs/ai-assistant-sequence-instructions.md. Reuses the same
// FilterGroup[] shape the map/list advanced filter builder uses
// (src/types/filters.ts), not a restricted subset.

const SERVICE_TYPES = ["buildingEngineering", "facilitySolutions", "janitorial", "specialProjects", "landscape"];

interface SequenceGrounding {
  tags: { id: string; label: string }[];
  cities: string[];
  states: string[];
}

async function buildSequenceGrounding(admin: ReturnType<typeof adminClient>): Promise<SequenceGrounding> {
  const [{ data: tags }, { data: locRows }] = await Promise.all([
    admin.from("tags").select("id, label"),
    admin.from("accounts").select("route_city, route_state"),
  ]);
  const cities = Array.from(new Set((locRows ?? []).map((r: { route_city: string | null }) => r.route_city).filter(Boolean))).sort();
  const states = Array.from(new Set((locRows ?? []).map((r: { route_state: string | null }) => r.route_state).filter(Boolean))).sort();
  return { tags: (tags ?? []) as { id: string; label: string }[], cities, states };
}

function sequenceSystemPrompt(g: SequenceGrounding): string {
  const tagsList = g.tags.length ? g.tags.map((t) => `${t.label} (id: ${t.id})`).join(", ") : "(no tags exist yet)";
  const citiesList = g.cities.length ? g.cities.join(", ") : "(none on file yet)";
  const statesList = g.states.length ? g.states.join(", ") : "(none on file yet)";

  return `You are helping a Rudiment/Encore team member build an email sequence — a REAL outbound campaign. "Save & activate" creates a real EmailBison campaign and "Push" attaches real leads to it; an activated sequence sends real email to real people. Get the audience and the copy right.

Formatting — plain text only, no markdown (no **bold**, no #headings, no "-"/"*"/"1." lists).

${QUESTION_FORMAT_NOTE}

${PERSONA_NOTE}

${REPAIR_RECOVERY_NOTE}

If the user's first message already gives you both the audience and the angle/goal, skip straight to restating the plan and asking to save — don't force clarifying questions onto a request that's already complete. Otherwise ask only for what's missing — at minimum you need who this is for (audience) and the angle/goal — one thing at a time, per PERSONA rule 1 above. Never invent a tag id, city, or state — only use the real ones listed below. Never suggest activating directly; every sequence you produce saves as a draft for the user to review the actual copy and activate themselves from the Sequences tab.

AUDIENCE (filter_groups — an array of FilterGroup, each { id, conditions: [{ id, field, operator, value }] }; groups are OR'd, conditions within a group are AND'd — most requests need just one group):
- field "status", operator "in"/"not_in", value { kind: "statuses", values: [...] } — subset of lead, active, canceled, new_customer.
- field "services", operator "in"/"not_in", value { kind: "services", values: [...] } — subset of ${SERVICE_TYPES.join(", ")}.
- field "tags", operator "in"/"not_in", value { kind: "tags", values: [...] } — real tag ids only. Real tags: ${tagsList}
- field "city", operator "in"/"not_in"/"contains"/"is_known"/"is_unknown", value { kind: "strings", values: [...] } (or { kind: "text", value: "..." } for contains). Real cities in use: ${citiesList}
- field "state", operator "in"/"not_in"/"is_known"/"is_unknown", value { kind: "strings", values: [...] }. Real states in use: ${statesList}
- field "lastVisitDate" or "lastContactedDate", operator "on"/"before"/"after"/"between"/"last_n_days"/"is_known"/"is_unknown", value { kind: "date", value: "ISO date" } or { kind: "dateRange", start, end } or { kind: "days", value: N }. "before" + a days value means "not contacted/visited in at least N days" — get the direction right.

Ask about audience in plain language and translate it into this shape yourself — never make the user speak in field/operator syntax.

STEPS (steps — an ordered array, each one email):
{ subject: string, body: string, waitDays: number } — waitDays on the first step is ignored (set it 0); each step after the first waits that many days after the previous one sends. The body can use {{first_name}} and {{company}} merge tags (filled in per recipient) — no other merge tags exist. Write real, specific, sendable cold-B2B-outbound copy for the stated audience/angle — short, one clear ask, not a generic template. Default to 2 steps (second one ~4 days later) if the user doesn't specify a cadence.

Once you have an audience and at least one step with real copy, restate the plan in plain English (audience, then step count/angle) and ask "Save this as a draft?" in plain text — wait for a yes.

OUTPUT (shape 3 — only after the yes) — reply with ONLY this JSON object, no prose before or after, no code fence:
{"type":"sequence_draft","summary":"<1-2 sentence plain-English description>","draft":{"name":"string","filter_groups":[...],"steps":[{"subject":"...","body":"...","waitDays":0}]}}`;
}

function parseSequenceDraftReply(text: string) {
  const parsed = extractJsonObject(text) as { type?: string; summary?: string; draft?: Record<string, unknown> } | null;
  if (parsed?.type !== "sequence_draft" || typeof parsed.summary !== "string" || !parsed.draft) return null;
  return { type: "sequence_draft" as const, summary: parsed.summary, draft: parsed.draft };
}

// ── Route build mode ─────────────────────────────────────────────────────
// Spec: docs/ai-assistant-route-instructions.md. Only ever references real
// account ids already loaded in the app — never invents a stop.

interface RouteAccountRow {
  id: string;
  account_name: string;
  route_city: string | null;
  route_state: string | null;
  account_status: string;
  last_visit_date: string | null;
  next_follow_up_date: string | null;
}

async function buildRouteGrounding(admin: ReturnType<typeof adminClient>): Promise<RouteAccountRow[]> {
  const rows: RouteAccountRow[] = [];
  const columns = "id, account_name, route_city, route_state, account_status, last_visit_date, next_follow_up_date";
  for (let page = 0; page < PAGE_SAFETY_LIMIT; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await admin.from("accounts").select(columns).order("account_name", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load accounts: ${error.message}`);
    rows.push(...((data ?? []) as unknown as RouteAccountRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function routeSystemPrompt(accounts: RouteAccountRow[], currentStopCount: number): string {
  const rows = accounts.slice(0, MAX_DETAIL_ROWS).map((a) =>
    `${a.id} | ${a.account_name} | ${a.account_status} | ${a.route_city ?? "?"}, ${a.route_state ?? "?"} | last visit: ${a.last_visit_date ?? "none"} | next follow-up: ${a.next_follow_up_date ?? "none"}`
  );
  const truncatedNote = accounts.length > MAX_DETAIL_ROWS
    ? `\n(Showing the first ${MAX_DETAIL_ROWS} of ${accounts.length} accounts — ask the user to narrow their criteria if what they want isn't covered here.)`
    : "";
  const inProgressNote = currentStopCount > 0
    ? `The rep already has ${currentStopCount} stop(s) selected in an in-progress route. Mention this and confirm before building a new list — it will replace what they have.`
    : "No route is currently in progress.";

  return `You are helping a Rudiment/Encore rep build a driving route from real accounts — a lower-stakes build than Workflow/Sequence: nothing saves to the database until the rep explicitly saves it, this just populates an editable in-progress route on the map.

Formatting — plain text only, no markdown.

${QUESTION_FORMAT_NOTE}

${PERSONA_NOTE}

${REPAIR_RECOVERY_NOTE}

Only ever reference real accounts from the list below — never invent a name or id. ${inProgressNote} You have no real distance/traffic data — do not claim to have computed an optimized driving order; order stops in a sensible, explainable way (e.g. grouped by city) and say so, mentioning the rep can drag to reorder or use Start Navigation (Google Maps) once stops are set. If a request would match more than ~25 accounts, don't build all of them into one route — ask the rep to narrow it or confirm they really want that many.

If the request already gives you enough to build a sane, bounded stop list (a clear area/criteria, matching at most ~25 accounts) AND there is no in-progress route to overwrite, skip the confirmation step entirely — go straight to the OUTPUT below; its "summary" field is what tells the user what got built, no separate restate-and-wait turn needed. Only ask a narrowing question first (one at a time, per PERSONA rule 1 above, plain text) when the criteria are genuinely ambiguous or would match too many accounts. If there IS an in-progress route already (see the note above), that's different — you must say so and get an explicit "yes" in plain text before it gets replaced; never overwrite it silently.

ACCOUNTS (id | name | status | city, state | last visit | next follow-up):
${rows.join("\n")}${truncatedNote}

OUTPUT (shape 3 — only after the yes) — reply with ONLY this JSON object, no prose before or after, no code fence:
{"type":"route_draft","summary":"<1-2 sentence plain-English description of the stop list and ordering>","accountIds":["<real id>","..."]}`;
}

function parseRouteDraftReply(text: string) {
  const parsed = extractJsonObject(text) as { type?: string; summary?: string; accountIds?: unknown } | null;
  if (parsed?.type !== "route_draft" || typeof parsed.summary !== "string" || !Array.isArray(parsed.accountIds)) return null;
  return { type: "route_draft" as const, summary: parsed.summary, accountIds: parsed.accountIds.map(String) };
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
  const mode = body?.mode as "workflow" | "sequence" | "route" | undefined;
  const currentRouteStopCount = Number(body?.currentRouteStopCount) || 0;
  if (!Array.isArray(messages) || !messages.length) {
    return json({ error: "messages array is required" }, 400);
  }

  try {
    const admin = adminClient();

    let system: string;
    if (mode === "workflow") {
      const grounding = await buildWorkflowGrounding(admin);
      system = workflowSystemPrompt(grounding);
    } else if (mode === "sequence") {
      const grounding = await buildSequenceGrounding(admin);
      system = sequenceSystemPrompt(grounding);
    } else if (mode === "route") {
      const grounding = await buildRouteGrounding(admin);
      system = routeSystemPrompt(grounding, currentRouteStopCount);
    } else {
      const grounding = await buildGroundingContext(admin);
      system = `You are the assistant embedded in a sales territory mapping tool. Answer questions about the real accounts below — when the user asks about "the map", "these accounts", or similar, answer from this exact data, do not ask what they mean.

${grounding}

Keep answers concise and practical for a sales rep working this territory.

Formatting rules — the chat UI renders your reply as plain text or as a data table, never as markdown:
- Never use markdown syntax (no **bold**, no #headings, no bullet "*"/"-" lists, no numbered-list punctuation meant for markdown). Write plain sentences.
- When the user asks you to list, count, filter, or browse specific accounts (e.g. "how many accounts do we have", "list the accounts", "which ones are in Dublin", "show me the canceled ones"), reply with ONLY one JSON object and nothing else — no prose before or after it, no code fences. Shape:
  {"text": "<1-2 sentence plain-text summary, state the total count here>", "total": <integer total matches>, "rows": [{"name": "...", "city": "...", "status": "...", "services": "..."}]}
  Include at most 20 rows in the array even if "total" is larger — never list more than 20, summarize the rest in "text" instead.
- For every other kind of question (advice, comparisons, strategy, yes/no, anything not a literal list of accounts), reply in plain text only — do not use the JSON shape.`;
    }

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
    const draftParser = mode === "workflow" ? parseWorkflowDraftReply
      : mode === "sequence" ? parseSequenceDraftReply
      : mode === "route" ? parseRouteDraftReply
      : null;
    const structured = mode
      ? (draftParser ? draftParser(text) : null)
      : parseStructuredReply(text);
    return json(structured || { text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-chat] error:", msg);
    return json({ error: msg }, 502);
  }
});
