import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, hubspotFetch, isAllowedEmail, resolveHubspotCompanyId, MISSING_HUBSPOT_ID } from "../_shared/hubspot.ts";

// "New business mode" from the sold Sales Map System proposal: the rep builds
// and sends a quote without leaving the map. This creates the real HubSpot
// objects (Deal + Line Item + Quote, associated to the account's Company/
// Contact) and flips the local quote to 'sent'.
//
// NOTE: this creates the CRM records via the API. Turning a Quote object into
// an actual customer-facing hosted/e-signable document additionally requires
// a `quoteTemplateId` from HubSpot's Quotes tool (Sales > Quotes > templates)
// — set HUBSPOT_QUOTE_TEMPLATE_ID once a template exists in the portal, or
// this creates the record without one and reps finish sending from HubSpot.
//
// The Drive-folder + Slack automation that's supposed to fire on quote-send
// (per the proposal) is n8n's job, watching HubSpot directly — not triggered
// from here. That's a separate, later workstream.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function associate(fromObject: string, fromId: string, toObject: string, toId: string) {
  await hubspotFetch(`/crm/v4/objects/${fromObject}/${fromId}/associations/default/${toObject}/${toId}`, {
    method: "PUT",
  });
}

async function findOpenDeal(companyId: string): Promise<string | null> {
  const res = await hubspotFetch(
    `/crm/v3/objects/companies/${companyId}/associations/deals`,
  ).catch(() => null);
  const dealId = res?.results?.[0]?.toObjectId ?? res?.results?.[0]?.id;
  return dealId ? String(dealId) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = adminClient();
  let logAccountId: string | null = null;
  let invokerEmail: string | null = null;

  const logAttempt = async (status: "ok" | "error", extra: Record<string, unknown>) => {
    try {
      await admin.from("hubspot_sync_log").insert({
        account_id: logAccountId,
        action: "create_quote",
        status,
        invoked_by_email: invokerEmail,
        ...extra,
      });
    } catch (logErr) {
      console.error("[hubspot-create-quote] failed to write sync log", logErr);
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

    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id;
    if (!quoteId) return json({ error: "quote_id required" }, 400);

    const { data: quote, error: quoteErr } = await admin.from("quotes").select("*").eq("id", quoteId).single();
    if (quoteErr || !quote) return json({ error: "quote not found", detail: quoteErr?.message }, 404);
    logAccountId = quote.account_id;

    if (quote.hubspot_quote_id) {
      return json({ ok: true, hubspot_quote_id: quote.hubspot_quote_id, account_id: quote.account_id, already_synced: true });
    }

    let companyId: string;
    try {
      companyId = await resolveHubspotCompanyId(admin, quote.account_id);
    } catch (e) {
      if (e instanceof Error && e.message === MISSING_HUBSPOT_ID) {
        return json({ error: "account_not_synced", detail: "Account has no HubSpot company yet — sync it first." }, 400);
      }
      throw e;
    }

    // 1) Find or create an open Deal for this account
    let dealId = await findOpenDeal(companyId).catch(() => null);
    if (!dealId) {
      const deal = await hubspotFetch(`/crm/v3/objects/deals`, {
        method: "POST",
        body: JSON.stringify({
          properties: {
            dealname: quote.title,
            amount: String(quote.amount),
            dealstage: "appointmentscheduled",
            pipeline: "default",
          },
        }),
      });
      dealId = deal.id;
      await associate("deals", dealId, "companies", companyId);
    }

    // 2) Create a line item for the quote amount, associated to the deal
    const lineItem = await hubspotFetch(`/crm/v3/objects/line_items`, {
      method: "POST",
      body: JSON.stringify({
        properties: {
          name: quote.title,
          quantity: "1",
          price: String(quote.amount),
        },
      }),
    });
    await associate("line_items", lineItem.id, "deals", dealId);

    // 3) Create the Quote object, associated to the deal and line item
    const quoteTemplateId = Deno.env.get("HUBSPOT_QUOTE_TEMPLATE_ID");
    const quoteProps: Record<string, unknown> = {
      hs_title: quote.title,
      hs_expiration_date: quote.valid_until ?? undefined,
      hs_status: "DRAFT",
    };
    if (quoteTemplateId) quoteProps.hs_quote_template_id = quoteTemplateId;

    const created = await hubspotFetch(`/crm/v3/objects/quotes`, {
      method: "POST",
      body: JSON.stringify({ properties: quoteProps }),
    });
    await associate("quotes", created.id, "deals", dealId);
    await associate("quotes", created.id, "line_items", lineItem.id);

    await admin.from("quotes").update({
      hubspot_quote_id: created.id,
      status: "sent",
    }).eq("id", quoteId);

    await logAttempt("ok", { hubspot_id: created.id });

    return json({ ok: true, hubspot_quote_id: created.id, account_id: quote.account_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[hubspot-create-quote] uncaught", msg);
    await logAttempt("error", { error_message: msg });
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
