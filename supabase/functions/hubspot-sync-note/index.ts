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
  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!isAllowedEmail(user.email)) return json({ error: "forbidden" }, 403);

    const { note_id } = await req.json();
    if (!note_id) return json({ error: "note_id required" }, 400);

    const admin = adminClient();
    const { data: note, error } = await admin.from("account_notes").select("*").eq("id", note_id).single();
    if (error || !note) return json({ error: "note not found" }, 404);

    const companyId = await resolveHubspotCompanyId(admin, note.account_id);

    const created = await hubspotFetch(`/crm/v3/objects/notes`, {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_note_body: note.note_text,
          hs_timestamp: new Date(note.created_at).getTime(),
        },
      }),
    });
    await hubspotFetch(`/crm/v4/objects/notes/${created.id}/associations/default/companies/${companyId}`, {
      method: "PUT",
    });

    await admin.from("account_notes").update({
      hubspot_synced: true,
      hubspot_id: created.id,
      hubspot_synced_at: new Date().toISOString(),
    }).eq("id", note_id);

    return json({ ok: true, hubspot_id: created.id });
  } catch (e) {
    if (e instanceof Error && e.message === MISSING_HUBSPOT_ID) {
      console.warn("[hubspot-sync-note] Account missing hubspot_company_id; skipping push.");
      return json({ ok: false, reason: "missing_hubspot_id" }, 200);
    }
    console.error("[hubspot-sync-note] Error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
