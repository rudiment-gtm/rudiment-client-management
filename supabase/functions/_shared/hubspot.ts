// Shared HubSpot helpers for edge functions.
//
// HubSpot private apps use one static access token (no OAuth dance, no
// per-org connection row, no admin "connect" page needed) — set HUBSPOT_ACCESS_TOKEN
// as a Supabase Edge Function secret: `supabase secrets set HUBSPOT_ACCESS_TOKEN=...`
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

const ALLOWED_EMAIL_DOMAINS = ["@getrudiment.com"];

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((d) => lower.endsWith(d));
}

function requireToken(): string {
  const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not configured. Set it as a Supabase Edge Function secret.");
  return token;
}

export async function hubspotFetch(path: string, init: RequestInit = {}) {
  const token = requireToken();
  const url = `https://api.hubapi.com${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`HubSpot ${init.method ?? "GET"} ${path} ${res.status}: ${text}`);
  return json;
}

export const MISSING_HUBSPOT_ID = "MISSING_HUBSPOT_ID";

// TODO: fill in with ProYard's real rep name -> HubSpot owner ID mapping once
// the HubSpot portal exists. Empty for now — resolveOwnerId() returns
// undefined until this is populated, meaning HubSpot Company/Contact records
// sync without an assigned owner rather than failing.
export const ASSIGNEE_TO_HUBSPOT_OWNER_ID: Record<string, string> = {};

export function resolveOwnerId(assignedTo: string | null | undefined): string | undefined {
  const key = (assignedTo ?? "").trim();
  if (!key) return undefined;
  return ASSIGNEE_TO_HUBSPOT_OWNER_ID[key];
}

// Strict resolver: only returns the HubSpot Company ID stored on the account.
// Never falls back to name-match or creates a new Company (to avoid duplicates).
export async function resolveHubspotCompanyId(
  admin: SupabaseClient,
  accountId: string,
): Promise<string> {
  const { data: account, error } = await admin.from("accounts").select("hubspot_company_id").eq("id", accountId).single();
  if (error || !account) throw new Error(`Account ${accountId} not found`);
  if (!account.hubspot_company_id) throw new Error(MISSING_HUBSPOT_ID);
  return account.hubspot_company_id;
}

// ---------- Field mapping helpers for HubSpot custom properties ----------

/**
 * Maps our DB `accounts.account_status` to the HubSpot custom property
 * `account_status` (created as a dropdown with these exact internal values —
 * see scripts/setup-hubspot-properties.mjs). Pass-through by design: no
 * translation table needed since the property was created to match.
 */
export function mapAccountStatus(status: string | null | undefined): string {
  return (status ?? "lead").trim().toLowerCase();
}

/**
 * Maps our DB `accounts.services` (text[]) to the HubSpot custom property
 * `service` (a multi-checkbox property, semicolon-delimited internal values).
 */
export function mapServices(services: string[] | null | undefined): string {
  return (services ?? []).join(";");
}

const US_STATE_CODES: Record<string, string> = {
  AL: "AL", AK: "AK", AZ: "AZ", AR: "AR", CA: "CA", CO: "CO", CT: "CT", DE: "DE",
  FL: "FL", GA: "GA", HI: "HI", ID: "ID", IL: "IL", IN: "IN", IA: "IA", KS: "KS",
  KY: "KY", LA: "LA", ME: "ME", MD: "MD", MA: "MA", MI: "MI", MN: "MN", MS: "MS",
  MO: "MO", MT: "MT", NE: "NE", NV: "NV", NH: "NH", NJ: "NJ", NM: "NM", NY: "NY",
  NC: "NC", ND: "ND", OH: "OH", OK: "OK", OR: "OR", PA: "PA", RI: "RI", SC: "SC",
  SD: "SD", TN: "TN", TX: "TX", UT: "UT", VT: "VT", VA: "VA", WA: "WA", WV: "WV",
  WI: "WI", WY: "WY", DC: "DC",
};

const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

/**
 * Coerces a US state name/code to the 2-letter code HubSpot's state field
 * expects. Returns undefined for unknown values so callers can omit the
 * field rather than send garbage. The DB row is never mutated.
 */
export function coerceUSState(state: string | null | undefined): string | undefined {
  const raw = (state ?? "").trim().replace(/\.$/, "");
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper.length === 2 && US_STATE_CODES[upper]) return upper;
  const lower = raw.toLowerCase();
  return US_STATE_NAMES[lower];
}
