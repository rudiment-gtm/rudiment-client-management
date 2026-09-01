// Reveals a single contact field (email or mobile number) on demand, so a
// rep can reveal each field independently instead of always spending a
// lookup on both at once. Used by the Prospect tab (revealing a person found
// via employee-finder) and the account drawer's saved-contacts list.
import { ENDPOINTS, callLeadMagic, domainFromWebsite } from "../_shared/leadmagic.ts";

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

  const apiKey = Deno.env.get("LEADMAGIC_API_KEY");
  if (!apiKey) {
    console.error("[leadmagic-reveal-contact] LEADMAGIC_API_KEY is not configured");
    return json({ notConfigured: true });
  }

  const { field, firstName, lastName, website, workEmail } = await req.json().catch(() => ({}));
  const domain = domainFromWebsite(website);

  try {
    if (field === "email") {
      const result = await callLeadMagic(ENDPOINTS.emailFinder, apiKey, { first_name: firstName, last_name: lastName, domain });
      const data = result.data as { status?: string; email?: string } | null;
      const email = (result.ok && data?.status !== "not_found") ? (data?.email || null) : null;
      return json({ email });
    }

    if (field === "phone") {
      if (!workEmail) return json({ error: "workEmail is required to reveal a phone number" }, 400);
      const result = await callLeadMagic(ENDPOINTS.mobileFinder, apiKey, { work_email: workEmail });
      const data = result.data as { mobile_number?: string } | null;
      return json({ phone: (result.ok && data?.mobile_number) || null });
    }

    return json({ error: 'field must be "email" or "phone"' }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[leadmagic-reveal-contact] error:", msg);
    return json({ error: "Could not reach LeadMagic", detail: msg }, 502);
  }
});
