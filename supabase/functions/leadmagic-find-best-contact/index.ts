// One-click "Find contacts" flow for the account drawer: picks the
// best-titled employee at a company and enriches them fully (email + phone)
// in a single round trip. Chains:
//   1. company-search (domain -> canonical company name)
//   2. employee-finder (company name -> employees with name + title)
//   3. email-finder    (best-titled employee + domain -> work email)
//   4. mobile-finder   (work email -> mobile number)
// Each step is best-effort: if a step fails or returns nothing, later steps
// are skipped and whatever was found so far is still returned.
//
// See leadmagic-find-employees (browse/multi-select for the Prospect tab)
// and leadmagic-reveal-contact (reveal one field on demand) for the flows
// that split these steps apart.
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

const TITLE_PRIORITY = [/\bowner\b/i, /\bpresident\b/i, /general manager/i, /\bgm\b/i, /\bmanager\b/i, /\bdirector\b/i];

function pickBestEmployee(employees: LeadMagicEmployee[]): LeadMagicEmployee {
  for (const pattern of TITLE_PRIORITY) {
    const match = employees.find((e) => e.title && pattern.test(e.title));
    if (match) return match;
  }
  return employees[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("LEADMAGIC_API_KEY");
  if (!apiKey) {
    console.error("[leadmagic-find-best-contact] LEADMAGIC_API_KEY is not configured");
    return json({ notConfigured: true, contacts: [] });
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
    if (!employeeResult.ok) return json({ contacts: [] });

    const employees = (((employeeResult.data as { data?: LeadMagicEmployee[] })?.data) || [])
      .filter((e) => e.first_name && e.last_name);
    if (!employees.length) return json({ contacts: [] });

    const best = pickBestEmployee(employees);

    let email: string | null = null;
    if (domain) {
      const emailResult = await callLeadMagic(ENDPOINTS.emailFinder, apiKey, {
        first_name: best.first_name,
        last_name: best.last_name,
        domain,
      });
      const emailData = emailResult.data as { status?: string; email?: string } | null;
      if (emailResult.ok && emailData?.status !== "not_found") email = emailData?.email || null;
    }

    let phone: string | null = null;
    if (email) {
      const mobileResult = await callLeadMagic(ENDPOINTS.mobileFinder, apiKey, { work_email: email });
      const mobileData = mobileResult.data as { mobile_number?: string } | null;
      if (mobileResult.ok) phone = mobileData?.mobile_number || null;
    }

    return json({
      contacts: [{
        firstName: best.first_name,
        lastName: best.last_name,
        title: best.title || null,
        linkedinUrl: best.profile_url || best.linkedin_url || best.li_url || null,
        email,
        phone,
      }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[leadmagic-find-best-contact] error:", msg);
    return json({ error: "Could not reach LeadMagic", detail: msg }, 502);
  }
});
