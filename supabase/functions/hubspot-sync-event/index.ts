import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, hubspotFetch, isAllowedEmail, resolveHubspotCompanyId, MISSING_HUBSPOT_ID } from "../_shared/hubspot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = adminClient();
  let logAccountId: string | null = null;
  let invokerEmail: string | null = null;

  const logAttempt = async (status: "ok" | "error" | "skipped", extra: Record<string, unknown>) => {
    try {
      await admin.from("hubspot_sync_log").insert({
        account_id: logAccountId,
        action: "sync_event",
        status,
        invoked_by_email: invokerEmail,
        ...extra,
      });
    } catch (logErr) {
      console.error("[hubspot-sync-event] failed to write sync log", logErr);
    }
  };

  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    invokerEmail = user.email ?? null;
    if (!isAllowedEmail(user.email)) return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const eventId = body?.event_id;
    if (!eventId) return json({ error: "event_id required" }, 400);

    const { data: ev, error } = await admin.from("account_events").select("*").eq("id", eventId).single();
    if (error || !ev) {
      await logAttempt("error", { error_message: `event not found: ${error?.message ?? "no row"}` });
      return json({ error: "event not found" }, 404);
    }
    logAccountId = ev.account_id;

    const companyId = await resolveHubspotCompanyId(admin, ev.account_id);

    const startIso = ev.start_at ?? new Date().toISOString();
    const bodyLines = [
      `${ev.event_type}${ev.event_medium ? ` (${ev.event_medium})` : ""} — assigned to ${ev.assigned_to}`,
      ev.notes ? `\n${ev.notes}` : "",
    ];

    let created;
    try {
      created = await hubspotFetch(`/crm/v3/objects/notes`, {
        method: "POST",
        body: JSON.stringify({
          properties: {
            hs_note_body: bodyLines.filter(Boolean).join(""),
            hs_timestamp: new Date(startIso).getTime(),
          },
        }),
      });
      await hubspotFetch(`/crm/v4/objects/notes/${created.id}/associations/default/companies/${companyId}`, {
        method: "PUT",
      });
    } catch (createErr) {
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      await logAttempt("error", { error_message: msg, hubspot_id: companyId });
      return json({ error: "hubspot_sync_failed", detail: msg }, 502);
    }

    await admin.from("account_events").update({
      hubspot_id: created.id,
      hubspot_synced_at: new Date().toISOString(),
    }).eq("id", eventId);

    await logAttempt("ok", { hubspot_id: created.id });

    return json({ ok: true, hubspot_id: created.id });
  } catch (e) {
    if (e instanceof Error && e.message === MISSING_HUBSPOT_ID) {
      console.warn("[hubspot-sync-event] Account missing hubspot_company_id; skipping push.");
      await logAttempt("skipped", { error_message: "missing_hubspot_id" });
      return json({ ok: false, reason: "missing_hubspot_id" }, 200);
    }
    console.error("[hubspot-sync-event] Error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await logAttempt("error", { error_message: `uncaught: ${msg}` });
    return json({ error: "Internal server error" }, 500);
  }
});
