// Shared helper for edge functions that call LeadMagic (B2B contact/employee
// finder API). Set the key as a Supabase Edge Function secret:
//   supabase secrets set LEADMAGIC_API_KEY=...
//
// Paths are versioned per-endpoint: company search is on v3, the people
// endpoints below are still on v1 — don't assume they share a version.
export const ENDPOINTS = {
  companySearch: "v3/companies/search",
  employeeFinder: "v1/people/employee-finder",
  emailFinder: "v1/people/email-finder",
  mobileFinder: "v1/people/mobile-finder",
};

export async function callLeadMagic(path: string, apiKey: string, body: Record<string, unknown>) {
  const upstream = await fetch(`https://api.leadmagic.io/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
  });
  const rawBody = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return { ok: false, data: null };
  }
  return { ok: upstream.ok, data };
}

export function domainFromWebsite(website?: string | null): string {
  return (website || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

// employee-finder matches on company name, not domain, so resolving the
// canonical name via company-search first (when we have a domain) gives it
// better odds than the raw account name (which often carries suffixes like
// "— Bldg 4" that company-search's own name won't have).
//
// v3/companies/search's actual response shape (verified against a live call):
// the resolved name is `companyName` (camelCase) at the top level, with
// `company.company_name` and `companies[0].company_name` (snake_case,
// nested) as the same value in two other spots — checking all three in
// order covers it even if one of those spots is ever dropped.
export async function resolveCompanyName(apiKey: string, domain: string, fallback: string): Promise<string> {
  if (!domain) return fallback;
  const company = await callLeadMagic(ENDPOINTS.companySearch, apiKey, { company_domain: domain });
  if (!company.ok) return fallback;
  const d = company.data as Record<string, unknown> | null;
  const nestedCompany = d?.company as Record<string, unknown> | undefined;
  const firstResult = (d?.companies as Record<string, unknown>[] | undefined)?.[0];
  const foundName = d?.companyName || nestedCompany?.company_name || firstResult?.company_name;
  return (typeof foundName === "string" && foundName) || fallback;
}
