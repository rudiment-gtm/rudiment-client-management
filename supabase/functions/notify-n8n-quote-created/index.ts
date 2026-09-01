import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called by the `account_events_quote_created_notify` DB trigger (via
// pg_net) whenever a "Quote Created" event is logged on an account. POSTs
// the quote details to n8n, which builds the Google Doc Schedule of
// Services from a template and posts a Slack notification. Set the webhook
// URL as a Supabase Edge Function secret:
//   supabase secrets set N8N_QUOTE_CREATED_WEBHOOK_URL=https://rudiment.app.n8n.cloud/webhook/ProYard/QouteCreated

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

const SERVICE_LABELS: Record<string, string> = {
  buildingEngineering: "Building Engineering",
  facilitySolutions: "Facility Solutions",
  janitorial: "Janitorial",
  specialProjects: "Special Projects",
  landscape: "Landscape",
};

function formatAddress(account: Record<string, any>): string {
  return [account.route_address, account.route_city, account.route_state, account.route_zip]
    .filter(Boolean)
    .join(", ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = adminClient();
  let eventId: string | undefined;
  let accountId: string | null = null;

  const logAttempt = async (status: "ok" | "error", extra: Record<string, unknown>) => {
    try {
      await admin.from("hubspot_sync_log").insert({
        account_id: accountId,
        action: "n8n_quote_created",
        status,
        ...extra,
      });
    } catch (logErr) {
      console.error("[notify-n8n-quote-created] failed to write sync log", logErr);
    }
  };

  try {
    const webhookUrl = Deno.env.get("N8N_QUOTE_CREATED_WEBHOOK_URL");
    if (!webhookUrl) {
      console.error("[notify-n8n-quote-created] N8N_QUOTE_CREATED_WEBHOOK_URL is not configured");
      return json({ error: "webhook_not_configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    eventId = body?.event_id;
    if (!eventId) return json({ error: "event_id required" }, 400);

    const { data: event, error: eventErr } = await admin.from("account_events").select("*").eq("id", eventId).single();
    if (eventErr || !event) {
      await logAttempt("error", { error_message: `event not found: ${eventErr?.message ?? "no row"}` });
      return json({ error: "event not found", detail: eventErr?.message }, 404);
    }
    accountId = event.account_id;

    const { data: account, error: accountErr } = await admin.from("accounts").select("*").eq("id", event.account_id).single();
    if (accountErr || !account) {
      await logAttempt("error", { error_message: `account not found: ${accountErr?.message ?? "no row"}` });
      return json({ error: "account not found", detail: accountErr?.message }, 404);
    }

    const services: string[] = event.quote_services ?? [];
    const payload = {
      event: "quote_created",
      quote_number: event.quote_number,
      client_name: account.account_name,
      client_address: formatAddress(account),
      service_details: services.map((s) => SERVICE_LABELS[s] ?? s),
      price_usd: event.quote_price_usd,
      account,
      account_event: event,
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
    return json({ ok: true, quote_number: event.quote_number });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify-n8n-quote-created] uncaught", msg);
    await logAttempt("error", { error_message: `uncaught: ${msg}` });
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
