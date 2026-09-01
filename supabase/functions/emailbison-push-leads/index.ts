// Pushes a rep-selected batch of accounts (already filtered client-side via
// evaluateFilters) into the EmailBison campaign behind a saved sequence.
// The sequence must have been saved at least once (has an
// emailbison_campaign_id) — Save creates the campaign/content, Push only
// ever adds leads to it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createOrUpdateLeads, attachLeadsToCampaign, emailBisonConfigured } from "../_shared/emailbison.ts";
import type { LeadInput } from "../_shared/emailbison.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BATCH_SIZE = 500; // EmailBison's bulk lead endpoint caps at 500/request

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!emailBisonConfigured()) {
    return json({ error: "EmailBison isn't connected yet — add an EMAILBISON_API_KEY secret to enable sequences." }, 400);
  }

  const { sequenceId, leads } = await req.json().catch(() => ({})) as {
    sequenceId?: string;
    leads?: LeadInput[];
  };
  if (!sequenceId) return json({ error: "sequenceId is required" }, 400);
  if (!leads?.length) return json({ error: "No leads to push — the filter matched nothing with an email address." }, 400);

  try {
    const { data: row, error: fetchError } = await supabase
      .from("email_sequences")
      .select("emailbison_campaign_id")
      .eq("id", sequenceId)
      .single();
    if (fetchError || !row) throw new Error("Sequence not found");
    if (!row.emailbison_campaign_id) throw new Error("Save the sequence before pushing leads — there's no campaign to push into yet.");

    let pushed = 0;
    for (const batch of chunk(leads, BATCH_SIZE)) {
      const created = await createOrUpdateLeads(batch);
      const leadIds = created.map((l) => l.id);
      if (leadIds.length) {
        await attachLeadsToCampaign(row.emailbison_campaign_id, leadIds);
        pushed += leadIds.length;
      }
    }

    const { error: updateError } = await supabase
      .from("email_sequences")
      .update({ last_pushed_lead_count: pushed, last_pushed_at: new Date().toISOString() })
      .eq("id", sequenceId);
    if (updateError) throw updateError;

    return json({ success: true, pushed });
  } catch (e) {
    console.error("[emailbison-push-leads] error:", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Push failed" }, 500);
  }
});
