import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, isAllowedEmail } from "../_shared/hubspot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Retries every account_event that has no hubspot_id but whose account already
// has a hubspot_company_id. When include_missing_account is true, also first
// creates the HubSpot Company for accounts that don't have one yet (HubSpot
// private-app sync has no required-picklist gate the way the old Salesforce
// integration did, so this is unconditional).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!isAllowedEmail(user.email)) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const includeMissingAccount: boolean = !!body?.include_missing_account;

    const admin = adminClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // 1) Optionally create HubSpot Companies for accounts that have unsynced events but no Company yet.
    const createResults: Array<{ account_id: string; ok: boolean; detail?: string }> = [];
    if (includeMissingAccount) {
      const { data: accountsMissing } = await admin
        .from("account_events")
        .select("account_id, accounts!inner(id, hubspot_company_id)")
        .is("hubspot_id", null)
        .is("accounts.hubspot_company_id", null);
      const uniqueAccountIds = new Set<string>();
      for (const row of accountsMissing ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a: any = (row as any).accounts;
        if (a?.id) uniqueAccountIds.add(a.id);
      }
      for (const aid of uniqueAccountIds) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/hubspot-create-account`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ account_id: aid }),
          });
          const data = await res.json().catch(() => null);
          createResults.push({ account_id: aid, ok: res.ok, detail: data?.detail ?? data?.error });
        } catch (err) {
          createResults.push({ account_id: aid, ok: false, detail: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    // 2) Retry sync for every unsynced event whose account now has a HubSpot Company.
    const { data: orphans, error } = await admin
      .from("account_events")
      .select("id, account_id, accounts!inner(hubspot_company_id)")
      .is("hubspot_id", null)
      .not("accounts.hubspot_company_id", "is", null)
      .limit(500);
    if (error) return json({ error: "query_failed", detail: error.message }, 500);

    let synced = 0;
    const failed: Array<{ event_id: string; detail: string }> = [];
    for (const ev of orphans ?? []) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/hubspot-sync-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ event_id: ev.id }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) synced++;
        else failed.push({ event_id: ev.id, detail: data?.detail ?? data?.error ?? `HTTP ${res.status}` });
      } catch (err) {
        failed.push({ event_id: ev.id, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    return json({
      ok: true,
      attempted: orphans?.length ?? 0,
      synced,
      failed,
      account_create_results: createResults,
    });
  } catch (e) {
    console.error("[hubspot-backfill-events] uncaught", e);
    return json({ error: "internal_error", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
