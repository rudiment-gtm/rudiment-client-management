// Creates or updates the real EmailBison campaign + sequence content behind
// a saved Encore sequence. First save: creates the campaign, then the
// sequence steps, and returns the ids to store on the row. Later saves (row
// already has emailbison_campaign_id/emailbison_sequence_id): updates the
// existing sequence steps in place, provided the step count hasn't changed
// since the last save — if a rep added/removed a step, this recreates the
// sequence from scratch instead (EmailBison's update endpoint requires an
// id for every step, so a changed step count can't be a partial update).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCampaign, createSequenceSteps, updateSequenceSteps, emailBisonConfigured } from "../_shared/emailbison.ts";
import type { SequenceStepInput } from "../_shared/emailbison.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface Step {
  subject: string;
  body: string;
  waitDays: number;
  emailbisonStepId?: number;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!emailBisonConfigured()) {
    return json({ error: "EmailBison isn't connected yet — add an EMAILBISON_API_KEY secret to enable sequences." }, 400);
  }

  const { sequenceId } = await req.json().catch(() => ({}));
  if (!sequenceId) return json({ error: "sequenceId is required" }, 400);

  try {
    const { data: row, error: fetchError } = await supabase
      .from("email_sequences")
      .select("*")
      .eq("id", sequenceId)
      .single();
    if (fetchError || !row) throw new Error("Sequence not found");
    if (!row.name?.trim()) throw new Error("Name is required");
    const steps = (row.steps ?? []) as Step[];
    if (steps.length === 0) throw new Error("Add at least one step before saving");

    const bisonSteps: SequenceStepInput[] = steps.map((s, i) => ({
      email_subject: s.subject,
      email_body: s.body,
      wait_in_days: s.waitDays,
      order: i + 1,
    }));

    let campaignId: number = row.emailbison_campaign_id;
    let sequenceResult: { id: number; sequence_steps: { id: number }[] };

    if (!campaignId) {
      const campaign = await createCampaign(row.name);
      campaignId = campaign.id;
      sequenceResult = await createSequenceSteps(campaignId, row.name, bisonSteps);
    } else if (row.emailbison_sequence_id && steps.length === steps.filter((s) => s.emailbisonStepId).length) {
      // Step count unchanged since last save — update each step in place.
      const stepsWithIds = steps.map((s, i) => ({ ...bisonSteps[i], id: s.emailbisonStepId! }));
      sequenceResult = await updateSequenceSteps(row.emailbison_sequence_id, row.name, stepsWithIds);
    } else {
      // Step count changed (added/removed a step) — recreate from scratch.
      sequenceResult = await createSequenceSteps(campaignId, row.name, bisonSteps);
    }

    const updatedSteps = steps.map((s, i) => ({
      ...s,
      emailbisonStepId: sequenceResult.sequence_steps[i]?.id ?? s.emailbisonStepId,
    }));

    const { error: updateError } = await supabase
      .from("email_sequences")
      .update({
        steps: updatedSteps,
        emailbison_campaign_id: campaignId,
        emailbison_sequence_id: sequenceResult.id,
      })
      .eq("id", sequenceId);
    if (updateError) throw updateError;

    return json({ success: true, emailbisonCampaignId: campaignId, emailbisonSequenceId: sequenceResult.id });
  } catch (e) {
    console.error("[emailbison-save-sequence] error:", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Save failed" }, 500);
  }
});
