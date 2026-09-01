import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called by the `accounts_activated_notify` DB trigger (via pg_net) whenever
// an account's status flips into 'active' from 'lead' (a conversion) or
// 'canceled' (a win-back). Fetches the full current row and POSTs it to the
// n8n webhook — set the webhook URL as a Supabase Edge Function secret so
// it isn't hardcoded in migration SQL:
//   supabase secrets set N8N_STATUS_CHANGE_WEBHOOK_URL=https://rudiment.app.n8n.cloud/webhook/payroad_status_change

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = adminClient();
  let accountId: string | undefined;

  const logAttempt = async (status: "ok" | "error", extra: Record<string, unknown>) => {
    try {
      await admin.from("hubspot_sync_log").insert({
        account_id: accountId ?? null,
        action: "n8n_to_active",
        status,
        ...extra,
      });
    } catch (logErr) {
      console.error("[notify-n8n-status-change] failed to write sync log", logErr);
    }
  };

  try {
    const webhookUrl = Deno.env.get("N8N_STATUS_CHANGE_WEBHOOK_URL");
    if (!webhookUrl) {
      console.error("[notify-n8n-status-change] N8N_STATUS_CHANGE_WEBHOOK_URL is not configured");
      return json({ error: "webhook_not_configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    accountId = body?.account_id;
    const fromStatus = typeof body?.from_status === "string" ? body.from_status : "unknown";
    if (!accountId) return json({ error: "account_id required" }, 400);

    const { data: account, error } = await admin.from("accounts").select("*").eq("id", accountId).single();
    if (error || !account) {
      await logAttempt("error", { error_message: `account not found: ${error?.message ?? "no row"}` });
      return json({ error: "account not found", detail: error?.message }, 404);
    }

    const payload = {
      event: "account_status_changed",
      from_status: fromStatus,
      to_status: "active",
      account,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await logAttempt("error", { error_message: `n8n webhook ${res.status}: ${text}`, request_payload: payload });
      return json({ error: "webhook_failed", detail: `HTTP ${res.status}` }, 502);
    }

    await logAttempt("ok", { request_payload: payload });
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify-n8n-status-change] uncaught", msg);
    await logAttempt("error", { error_message: `uncaught: ${msg}` });
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
