// Shared EmailBison REST helpers for edge functions. Encore's own workspace
// has a single static API key (EMAILBISON_API_KEY, set as an edge function
// secret) — no per-user OAuth, matching the Slack/HubSpot static-token
// pattern elsewhere in this codebase.

const BASE_URL = "https://send.getrudiment.com/api";

function requireApiKey(): string {
  const key = Deno.env.get("EMAILBISON_API_KEY");
  if (!key) throw new Error("EMAILBISON_API_KEY is not configured. Set it as a Supabase Edge Function secret.");
  return key;
}

async function bisonFetch(path: string, init: RequestInit = {}) {
  const key = requireApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = (data as { message?: string })?.message ?? `EmailBison API ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export function emailBisonConfigured(): boolean {
  return !!Deno.env.get("EMAILBISON_API_KEY");
}

export interface SequenceStepInput {
  email_subject: string;
  email_body: string;
  wait_in_days: number;
  order: number;
}

export async function createCampaign(name: string): Promise<{ id: number }> {
  const res = await bisonFetch("/campaigns", {
    method: "POST",
    body: JSON.stringify({ name }),
  }) as { data: { id: number } };
  return res.data;
}

export async function createSequenceSteps(campaignId: number, title: string, steps: SequenceStepInput[]) {
  const res = await bisonFetch(`/campaigns/v1.1/${campaignId}/sequence-steps`, {
    method: "POST",
    body: JSON.stringify({ title, sequence_steps: steps }),
  }) as { data: { id: number; sequence_steps: { id: number }[] } };
  return res.data;
}

export async function updateSequenceSteps(
  sequenceId: number,
  title: string,
  steps: (SequenceStepInput & { id: number })[],
) {
  const res = await bisonFetch(`/campaigns/v1.1/sequence-steps/${sequenceId}`, {
    method: "PUT",
    body: JSON.stringify({ title, sequence_steps: steps }),
  }) as { data: { id: number; sequence_steps: { id: number }[] } };
  return res.data;
}

export interface LeadInput {
  first_name: string;
  last_name?: string;
  email: string;
  title?: string;
  company?: string;
}

export async function createOrUpdateLeads(leads: LeadInput[]): Promise<{ id: number; email: string }[]> {
  const res = await bisonFetch("/leads/create-or-update/multiple", {
    method: "POST",
    body: JSON.stringify({ existing_lead_behavior: "patch", leads }),
  }) as { data: { id: number; email: string }[] };
  return res.data;
}

export async function attachLeadsToCampaign(campaignId: number, leadIds: number[]) {
  await bisonFetch(`/campaigns/${campaignId}/leads/attach-leads`, {
    method: "POST",
    body: JSON.stringify({ lead_ids: leadIds }),
  });
}

// EmailBison's "master inbox" — every reply/bounce/auto-response across every
// campaign, not scoped to a single sequence. Endpoint paths confirmed against
// the real API spec (search_api_spec), not guessed.
//
// The documented `status`/`tracked_reply` query params turned out NOT to
// reliably filter server-side (verified empirically: passing tracked_reply=true
// returned an identical result set to omitting it). The three booleans on
// each reply object (automated_reply, interested, tracked_reply) ARE
// accurate, though — so filtering happens client-side here, walking pages
// via cursor pagination until enough matches are found.

export interface BisonReply {
  id: number;
  automated_reply: boolean;
  interested: boolean;
  tracked_reply: boolean;
  [key: string]: unknown;
}

interface BisonReplyPage {
  data: BisonReply[];
  meta?: { next_cursor: string | null };
}

export interface ReplyListParams {
  folder?: "inbox" | "sent" | "spam" | "bounced" | "all";
  search?: string;
}

export type ReplyStatusFilter = "all" | "interested" | "real" | "automated";

const REPLY_MATCH: Record<ReplyStatusFilter, (r: BisonReply) => boolean> = {
  all: () => true,
  interested: (r) => r.interested === true,
  real: (r) => r.tracked_reply === true,
  automated: (r) => r.automated_reply === true,
};

// Walks up to maxPages of the master inbox, filtering client-side, until
// `limit` matches are collected or pages run out — bounded so a noisy inbox
// (e.g. all DMARC/report mail) can't turn one request into an unbounded scan.
export async function listReplies(
  params: ReplyListParams,
  statusFilter: ReplyStatusFilter,
  limit = 30,
  maxPages = 6,
): Promise<{ data: BisonReply[]; scannedAllAvailable: boolean }> {
  const matches: BisonReply[] = [];
  let cursor: string | undefined;
  let scannedAllAvailable = false;

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams();
    if (params.folder) qs.set("folder", params.folder);
    if (params.search) qs.set("search", params.search);
    if (cursor) qs.set("cursor", cursor);
    const result = await bisonFetch(`/replies?${qs.toString()}`) as BisonReplyPage;

    for (const reply of result.data) {
      if (REPLY_MATCH[statusFilter](reply)) matches.push(reply);
    }

    const nextCursor = result.meta?.next_cursor ?? null;
    if (!nextCursor) {
      scannedAllAvailable = true;
      break;
    }
    cursor = nextCursor;
    if (matches.length >= limit) break;
  }

  return { data: matches.slice(0, limit), scannedAllAvailable };
}

export async function getReply(replyId: number) {
  return await bisonFetch(`/replies/${replyId}`);
}

export interface ReplyRecipient {
  email_address: string;
  name?: string | null;
}

export interface SendReplyInput {
  replyId: number;
  message: string;
  senderEmailId?: number;
  toEmails?: ReplyRecipient[];
  ccEmails?: ReplyRecipient[];
  bccEmails?: ReplyRecipient[];
  replyAll?: boolean;
  contentType?: "html" | "text";
}

export async function sendReply(input: SendReplyInput) {
  const body: Record<string, unknown> = {
    message: input.message,
    reply_all: input.replyAll ?? true,
    content_type: input.contentType ?? "text",
    inject_previous_email_body: true,
  };
  if (input.senderEmailId !== undefined) body.sender_email_id = input.senderEmailId;
  if (input.toEmails?.length) body.to_emails = input.toEmails;
  if (input.ccEmails?.length) body.cc_emails = input.ccEmails;
  if (input.bccEmails?.length) body.bcc_emails = input.bccEmails;

  return await bisonFetch(`/replies/${input.replyId}/reply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
