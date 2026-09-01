import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  adminClient,
  coerceUSState,
  hubspotFetch,
  isAllowedEmail,
  mapAccountStatus,
  mapServices,
  resolveOwnerId,
} from "../_shared/hubspot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function domainFromWebsite(website: string | null | undefined): string | undefined {
  if (!website) return undefined;
  try {
    const url = website.match(/^https?:\/\//) ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

async function findExistingCompany(account: Record<string, any>): Promise<{ id: string; name: string } | null> {
  const domain = domainFromWebsite(account.website);
  if (domain) {
    const res = await hubspotFetch(`/crm/v3/objects/companies/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: domain }] }],
        properties: ["name"],
        limit: 1,
      }),
    });
    const hit = res?.results?.[0];
    if (hit) return { id: hit.id, name: hit.properties?.name ?? "" };
  }
  if (account.account_name) {
    const res = await hubspotFetch(`/crm/v3/objects/companies/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: account.account_name }] }],
        properties: ["name"],
        limit: 1,
      }),
    });
    const hit = res?.results?.[0];
    if (hit) return { id: hit.id, name: hit.properties?.name ?? "" };
  }
  return null;
}

async function findExistingContact(email: string): Promise<string | null> {
  const res = await hubspotFetch(`/crm/v3/objects/contacts/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email"],
      limit: 1,
    }),
  });
  return res?.results?.[0]?.id ?? null;
}

async function associateContactWithCompany(contactId: string, companyId: string) {
  // v4 associations API, default "company_to_contact" label
  await hubspotFetch(`/crm/v4/objects/companies/${companyId}/associations/default/contacts/${contactId}`, {
    method: "PUT",
  });
}

async function retryOrphanEvents(admin: ReturnType<typeof adminClient>, accountId: string, authHeader: string): Promise<void> {
  try {
    const { data: orphans } = await admin
      .from("account_events")
      .select("id")
      .eq("account_id", accountId)
      .is("hubspot_id", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!orphans || orphans.length === 0) return;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    for (const ev of orphans) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/hubspot-sync-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ event_id: ev.id }),
        });
      } catch (err) {
        console.warn("[hubspot-create-account] orphan retry failed", ev.id, err);
      }
    }
  } catch (err) {
    console.warn("[hubspot-create-account] retryOrphanEvents failed", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = adminClient();
  let logAccountId: string | undefined;
  let invokerEmail: string | null = null;

  const logAttempt = async (status: "ok" | "matched" | "error", extra: Record<string, unknown>) => {
    try {
      await admin.from("hubspot_sync_log").insert({
        account_id: logAccountId ?? null,
        action: "create_account",
        status,
        invoked_by_email: invokerEmail,
        ...extra,
      });
    } catch (logErr) {
      console.error("[hubspot-create-account] failed to write sync log", logErr);
    }
  };

  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      await logAttempt("error", { error_message: "unauthorized (no session)" });
      return json({ error: "unauthorized", detail: "No active session on the request." }, 401);
    }
    invokerEmail = user.email ?? null;
    if (!isAllowedEmail(user.email)) {
      await logAttempt("error", { error_message: `forbidden domain: ${user.email}` });
      return json({ error: "forbidden", detail: `Email domain not allowed: ${user.email}` }, 403);
    }

    const body = await req.json().catch(() => ({}));
    logAccountId = body?.account_id;
    if (!logAccountId) {
      await logAttempt("error", { error_message: "account_id missing in request" });
      return json({ error: "account_id required" }, 400);
    }

    const { data: account, error: accountErr } = await admin.from("accounts").select("*").eq("id", logAccountId).single();
    if (accountErr || !account) {
      await logAttempt("error", { error_message: `account not found: ${accountErr?.message ?? "no row"}` });
      return json({ error: "account not found", detail: accountErr?.message }, 404);
    }
    if (account.hubspot_company_id) {
      await logAttempt("ok", { hubspot_id: account.hubspot_company_id, error_message: "already synced (noop)" });
      return json({ ok: true, hubspot_company_id: account.hubspot_company_id, already_synced: true });
    }

    console.log(`[hubspot-create-account] account=${logAccountId} name="${account.account_name}" invoker=${invokerEmail}`);

    let companyId: string;
    let companyName: string;
    let matched = false;

    let existing: Awaited<ReturnType<typeof findExistingCompany>> = null;
    try {
      existing = await findExistingCompany(account);
    } catch (dedupErr) {
      console.warn("[hubspot-create-account] dedup query failed, continuing to create", dedupErr instanceof Error ? dedupErr.message : dedupErr);
    }

    if (existing) {
      companyId = existing.id;
      companyName = existing.name;
      matched = true;
      console.log(`[hubspot-create-account] matched existing company ${companyId}`);
    } else {
      const ownerId = resolveOwnerId(account.assigned_to);
      const properties: Record<string, unknown> = {
        name: account.account_name ?? "Unknown",
        address: account.route_address ?? undefined,
        city: account.route_city ?? undefined,
        state: coerceUSState(account.route_state),
        zip: account.route_zip ?? undefined,
        country: "United States",
        service: mapServices(account.services),
        account_status: mapAccountStatus(account.account_status),
        cancel_date: account.cancel_date ?? undefined,
      };
      if (account.main_phone) properties.phone = account.main_phone;
      if (account.website) properties.domain = domainFromWebsite(account.website);
      if (account.account_notes) properties.description = account.account_notes;
      if (ownerId) properties.hubspot_owner_id = ownerId;

      let created;
      try {
        created = await hubspotFetch(`/crm/v3/objects/companies`, {
          method: "POST",
          body: JSON.stringify({ properties }),
        });
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr);
        console.error("[hubspot-create-account] Company create failed", msg);
        await logAttempt("error", { error_message: msg, request_payload: properties });
        return json({ error: "hubspot_create_failed", detail: msg }, 502);
      }
      if (!created?.id) {
        const errMsg = `HubSpot Company create returned unexpected payload: ${JSON.stringify(created)}`;
        await logAttempt("error", { error_message: errMsg, request_payload: properties, response_payload: created });
        return json({ error: "hubspot_create_failed", detail: errMsg }, 502);
      }
      companyId = created.id;
      companyName = String(properties.name);
    }

    // Optional Contact
    let contactId: string | undefined;
    const contactName = [account.first_name, account.last_name].filter(Boolean).join(" ") || account.primary_contact;
    if (contactName || account.main_email || account.main_phone) {
      try {
        if (account.main_email) {
          contactId = (await findExistingContact(account.main_email)) ?? undefined;
        }
        if (!contactId) {
          const contactProps: Record<string, unknown> = {};
          if (account.first_name) contactProps.firstname = account.first_name;
          if (account.last_name) contactProps.lastname = account.last_name;
          if (!account.first_name && !account.last_name && account.primary_contact) contactProps.lastname = account.primary_contact;
          if (account.job_title) contactProps.jobtitle = account.job_title;
          if (account.main_email) contactProps.email = account.main_email;
          if (account.main_phone) contactProps.phone = account.main_phone;
          if (Object.keys(contactProps).length > 0) {
            const createdContact = await hubspotFetch(`/crm/v3/objects/contacts`, {
              method: "POST",
              body: JSON.stringify({ properties: contactProps }),
            });
            contactId = createdContact?.id;
          }
        }
        if (contactId) await associateContactWithCompany(contactId, companyId);
      } catch (e) {
        console.warn("[hubspot-create-account] contact create/associate failed (non-fatal)", e instanceof Error ? e.message : String(e));
      }
    }

    const { error: updateErr } = await admin
      .from("accounts")
      .update({ hubspot_company_id: companyId, hubspot_contact_id: contactId ?? null })
      .eq("id", logAccountId);
    if (updateErr) {
      console.error("[hubspot-create-account] failed to save HubSpot id back to account", updateErr);
    }

    await retryOrphanEvents(admin, logAccountId, req.headers.get("Authorization") ?? "");

    await logAttempt(matched ? "matched" : "ok", {
      hubspot_id: companyId,
      error_message: matched ? "matched by domain/name" : null,
    });

    return json({
      ok: true,
      hubspot_company_id: companyId,
      hubspot_contact_id: contactId,
      account_name: companyName,
      matched,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[hubspot-create-account] uncaught", msg);
    await logAttempt("error", { error_message: `uncaught: ${msg}` });
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
