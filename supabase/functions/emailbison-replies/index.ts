// Encore-staff-only view into EmailBison's master inbox. Deployed with
// verify_jwt=true (an authenticated Encore session is required) — this is
// deliberately not exposed through the read-only client dashboard iframe,
// since replies contain real lead conversation content.
import { listReplies, getReply, emailBisonConfigured } from "../_shared/emailbison.ts";
import type { ReplyStatusFilter } from "../_shared/emailbison.ts";

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

  if (!emailBisonConfigured()) {
    return json({ error: "EmailBison isn't connected yet — add an EMAILBISON_API_KEY secret to enable replies." }, 400);
  }

  const { replyId, folder, status, search } = await req.json().catch(() => ({})) as {
    replyId?: number;
    folder?: "inbox" | "sent" | "spam" | "bounced" | "all";
    status?: ReplyStatusFilter;
    search?: string;
  };

  try {
    if (replyId) {
      const reply = await getReply(replyId);
      return json(reply);
    }

    const result = await listReplies(
      { folder: folder ?? "inbox", search },
      status ?? "real",
    );
    return json(result);
  } catch (e) {
    console.error("[emailbison-replies] error:", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Failed to load replies" }, 500);
  }
});
