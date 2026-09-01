// Lists employees at a company (name + title only, no email/phone) so the
// rep can pick the right person before filling in an account's contact
// fields. Called from the "Find Contacts" action in the account drawer.
import { ENDPOINTS, callLeadMagic, domainFromWebsite, resolveCompanyName } from "../_shared/leadmagic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface LeadMagicEmployee {
  first_name?: string;
  last_name?: string;
  title?: string;
  profile_url?: string;
  linkedin_url?: string;
  li_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("LEADMAGIC_API_KEY");
  if (!apiKey) {
    console.error("[leadmagic-find-employees] LEADMAGIC_API_KEY is not configured");
    return json({ notConfigured: true, employees: [] });
  }

  const { companyName, website } = await req.json().catch(() => ({}));
  if (!companyName) return json({ error: "companyName is required" }, 400);

  const domain = domainFromWebsite(website);

  try {
    const resolvedCompanyName = await resolveCompanyName(apiKey, domain, companyName);
    const employeeResult = await callLeadMagic(ENDPOINTS.employeeFinder, apiKey, {
      company_name: resolvedCompanyName,
      per_page: 20,
    });
    if (!employeeResult.ok) return json({ employees: [] });

    const rows = ((employeeResult.data as { data?: LeadMagicEmployee[] })?.data) || [];
    const employees = rows
      .filter((e) => e.first_name && e.last_name)
      .map((e) => ({
        firstName: e.first_name,
        lastName: e.last_name,
        title: e.title || null,
        linkedinUrl: e.profile_url || e.linkedin_url || e.li_url || null,
      }));

    return json({ employees });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[leadmagic-find-employees] error:", msg);
    return json({ error: "Could not reach LeadMagic", detail: msg }, 502);
  }
});
