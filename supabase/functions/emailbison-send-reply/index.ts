// Sends a reply into an existing EmailBison conversation thread on behalf of
// Encore staff. Encore-staff-only (verify_jwt=true) — never exposed to the
// read-only client dashboard iframe, since this is a real outbound send.
import { sendReply, emailBisonConfigured } from "../_shared/emailbison.ts";
import type { ReplyRecipient } from "../_shared/emailbison.ts";

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

  const { replyId, message, senderEmailId, toEmails } = await req.json().catch(() => ({})) as {
    replyId?: number;
    message?: string;
    senderEmailId?: number;
    toEmails?: ReplyRecipient[];
  };
  if (!replyId) return json({ error: "replyId is required" }, 400);
  if (!message?.trim()) return json({ error: "message is required" }, 400);

  try {
    const result = await sendReply({
      replyId,
      message,
      senderEmailId,
      toEmails,
      replyAll: true, // auto-selects sender + original recipients from the thread
      contentType: "text",
    });
    return json(result);
  } catch (e) {
    console.error("[emailbison-send-reply] error:", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Failed to send reply" }, 500);
  }
});
