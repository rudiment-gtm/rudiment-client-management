// STALE — deferred per plan ("port the Clay sync pattern later, if/when
// ProYard gets Clay enrichment"). This file still references the OLD schema
// (company_name/contact_name/full_address/industry/rating/icp_fit_score/etc,
// none of which exist on the new `accounts` table — see
// supabase/migrations/20260727000000_init.sql and src/types/account.ts).
// Deno edge functions aren't part of the Vite/tsc build, so this won't block
// the app, but it WILL fail at runtime if ever invoked. Needs a full field-
// mapping rewrite (company_name->account_name, full_address->route_address,
// industry->services[], no rating/icp_fit_score/priority equivalent, etc.)
// before wiring up real Clay enrichment.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clay-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Validate webhook API key
function validateApiKey(req: Request): boolean {
  const CLAY_API_KEY = Deno.env.get('CLAY_API_KEY');
  if (!CLAY_API_KEY) {
    console.error('CLAY_API_KEY not configured');
    return false;
  }
  const headerKey = req.headers.get('x-clay-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
  return headerKey === CLAY_API_KEY;
}

// Zod schema for Clay webhook payload validation
const ClayRowSchema = z.object({}).passthrough().refine(
  (data) => {
    const keys = Object.keys(data);
    return keys.length > 0 && keys.length <= 200;
  },
  { message: "Row must have between 1 and 200 fields" }
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim();
  if (str.length === 0) return null;
  return str.slice(0, maxLength);
}

function sanitizeRequiredString(value: unknown, maxLength: number, fallback: string): string {
  const result = sanitizeString(value, maxLength);
  return result || fallback;
}

function sanitizeNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

function sanitizeEmail(value: unknown): string | null {
  const str = sanitizeString(value, 255);
  if (!str) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return null;
  return str;
}

function getSafeErrorMessage(error: unknown): { code: string; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('Internal error details:', msg);
  if (msg.includes('duplicate') || msg.includes('unique')) {
    return { code: 'DUPLICATE_ENTRY', message: 'Record already exists' };
  }
  if (msg.includes('database') || msg.includes('Database')) {
    return { code: 'DATABASE_ERROR', message: 'Database operation failed' };
  }
  if (msg.includes('Mapbox') || msg.includes('geocod')) {
    return { code: 'GEOCODING_ERROR', message: 'Geocoding service unavailable' };
  }
  return { code: 'INTERNAL_ERROR', message: 'Request failed. Please try again.' };
}

interface GeocodedLocation {
  latitude: number | null;
  longitude: number | null;
}

async function geocodeAddress(address: string, mapboxToken: string): Promise<GeocodedLocation> {
  if (!address || !mapboxToken) return { latitude: null, longitude: null };
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&limit=1`
    );
    if (!response.ok) return { latitude: null, longitude: null };
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [longitude, latitude] = data.features[0].center;
      return { latitude, longitude };
    }
    return { latitude: null, longitude: null };
  } catch (error) {
    console.error('Geocoding error:', error);
    return { latitude: null, longitude: null };
  }
}

function normalizeIndustry(industry?: string | null): string {
  if (!industry) return 'other';
  const lower = industry.toLowerCase();
  if (lower.includes('warehouse') || lower.includes('distribution')) return 'warehouse';
  if (lower.includes('event')) return 'events';
  if (lower.includes('food') || lower.includes('restaurant') || lower.includes('catering')) return 'food';
  if (lower.includes('tech') || lower.includes('software') || lower.includes('it ')) return 'technology';
  if (lower.includes('service') || lower.includes('hospitality') || lower.includes('hotel') || lower.includes('construct') || lower.includes('logistic') || lower.includes('freight') || lower.includes('manufactur')) return 'services';
  if (lower.includes('retail')) return 'retail';
  return 'other';
}

function normalizeStatus(status?: string | null): string {
  if (!status) return 'account';
  const lower = status.toLowerCase().trim();
  if (lower === 'opportunities' || lower === 'opportunity') return 'account';
  if (lower === 'accounts' || lower === 'account') return 'account';
  if (lower === 'active') return 'active';
  if (lower === 'at-risk' || lower === 'at risk') return 'at-risk';
  if (lower === 'reactivation' || lower === 'churned' || lower === 'churn') return 'churned';
  if (lower === 'expansion') return 'expansion';
  if (lower === 'flex tier' || lower === 'flex-tier' || lower === 'flex_tier' || lower === 'flex') return 'flex-tier';
  if (lower === 'lost' || lower === 'closed lost' || lower === 'closed-lost' || lower === 'closed_lost') return 'lost';
  if (lower === 'inactive') return 'inactive';
  if (lower.includes('flex')) return 'flex-tier';
  if (lower.includes('opportunit') || lower.includes('new') || lower.includes('prospect')) return 'account';
  if (lower.includes('active')) return 'active';
  if (lower.includes('risk')) return 'at-risk';
  if (lower.includes('churn') || lower.includes('reactivat')) return 'churned';
  if (lower.includes('expan') || lower.includes('upsell')) return 'expansion';
  if (lower.includes('lost')) return 'lost';
  if (lower.includes('inactive')) return 'inactive';
  return 'account';
}

function normalizeRating(rating?: string | null): string | null {
  if (!rating) return null;
  const lower = rating.toLowerCase().trim();
  if (lower === 'hot' || lower.includes('hot')) return 'hot';
  if (lower === 'warm' || lower.includes('warm')) return 'warm';
  if (lower === 'cold' || lower.includes('cold')) return 'cold';
  return null;
}




function normalizePriority(priority?: string | null): string {
  if (!priority) return 'medium';
  const lower = priority.toLowerCase();
  if (lower.includes('high')) return 'high';
  if (lower.includes('low')) return 'low';
  return 'medium';
}

// Pull a value from a row using a list of possible keys
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
}

// Build a partial update object — only includes keys whose source value is present.
function buildPartialUpdate(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const setStr = (col: string, raw: unknown, max: number) => {
    if (raw === undefined) return;
    const v = sanitizeString(raw, max);
    if (v !== null) out[col] = v;
  };
  const setNum = (col: string, raw: unknown, min: number, max: number) => {
    if (raw === undefined) return;
    const v = sanitizeNumber(raw, min, max);
    if (v !== null) out[col] = v;
  };

  setStr('company_name', pick(row, ['Company Name', 'Company', 'company_name', 'company']), 255);

  const firstName = sanitizeString(pick(row, ['contact_first_name', 'Contact first Name', 'Contact First Name', 'Contact first name', 'First Name', 'First name', 'first_name', 'first name']), 100);
  const lastName = sanitizeString(pick(row, ['contact_last_name', 'Contact Last Name', 'Contact last name', 'Last Name', 'Last name', 'last_name', 'last name']), 100);
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
  const explicitName = sanitizeString(pick(row, ['Contact Name', 'Contact name', 'contact_name', 'contact name', 'Name', 'name', 'Full Name', 'Full name', 'full_name', 'Person Name', 'Person name']), 255);
  if (explicitName) out.contact_name = explicitName;
  else if (combined) out.contact_name = combined;

  setStr('job_title', pick(row, ['contact_title', 'Job Title', 'Contact Title', 'Title', 'job_title', 'title']), 255);

  const emailRaw = pick(row, ['Email', 'email']);
  if (emailRaw !== undefined) {
    const e = sanitizeEmail(emailRaw);
    if (e) out.email = e;
  }

  setStr('phone', pick(row, ['contact_phone_number', 'Phone', 'Contact Phone Number', 'Phone Number', 'phone']), 50);
  setStr('linkedin_url', pick(row, ['LinkedIn URL', 'linkedin_url']), 500);
  setStr('website', pick(row, ['Website', 'website']), 500);
  setStr('full_address', pick(row, ['Full Address', 'Address', 'full_address', 'address']), 500);
  setStr('city', pick(row, ['City', 'city']), 100);
  setStr('state', pick(row, ['State', 'state']), 50);
  setStr('zip_code', pick(row, ['Zip Code', 'Zip', 'zip_code', 'zip']), 20);

  setNum('latitude', pick(row, ['Latitude', 'Lat', 'latitude', 'lat']), -90, 90);
  setNum('longitude', pick(row, ['Longitude', 'Long', 'Lng', 'longitude', 'long', 'lng']), -180, 180);

  const indRaw = pick(row, ['Industry', 'industry']);
  if (indRaw !== undefined) {
    const s = sanitizeString(indRaw, 100);
    if (s) out.industry = normalizeIndustry(s);
  }
  const statusRaw = pick(row, ['Account Status', 'Status', 'account_status', 'status']);
  if (statusRaw !== undefined) {
    const s = sanitizeString(statusRaw, 100);
    if (s) out.account_status = normalizeStatus(s);
  }
  const prioRaw = pick(row, ['Priority', 'priority']);
  if (prioRaw !== undefined) {
    const s = sanitizeString(prioRaw, 50);
    if (s) out.priority = normalizePriority(s);
  }

  setStr('notes', pick(row, ['Notes', 'notes']), 5000);
  setNum('estimated_deal_size', pick(row, ['Estimated Deal Size', 'Deal Size', 'estimated_deal_size', 'deal_size']), 0, 999999999);
  setStr('last_posting_description', pick(row, ['Last Posting', 'Last Posting Description', 'last_posting_description', 'last_posting']), 2000);
  setStr('last_posting_author', pick(row, ['Who Posted', 'Last Posting Author', 'last_posting_author', 'who_posted']), 255);
  setStr('last_posting_date', pick(row, ['Last Posting Date', 'last_posting_date']), 50);
  setNum('postings_per_month', pick(row, ['Postings Per Month', 'Postings/Month', 'postings_per_month']), 0, 99999);
  setNum('pay_rate', pick(row, ['Pay Rate', 'pay_rate']), 0, 999999);
  setNum('icp_fit_score', pick(row, ['ICP Fit Score', 'ICP Score', 'icp_fit_score', 'icp_score']), 0, 200);
  setStr('hubspot_account_id', pick(row, ['hubspot_id', 'HubSpot ID', 'HubSpot Id', 'hubspot_account_id', 'HubSpot Account ID', 'SF ID', 'sf_id']), 100);
  setStr('clay_record_id', pick(row, ['clay_record_id', 'Clay Record ID', 'Clay Record Id']), 255);

  const ratingRaw = pick(row, ['Rating', 'rating']);
  if (ratingRaw !== undefined) {
    const r = normalizeRating(sanitizeString(ratingRaw, 50));
    if (r) out.rating = r;
  }

  return out;
}

async function handleLookup(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const rawId = url.searchParams.get('id');
  const id = rawId ? rawId.trim().slice(0, 100) : '';
  console.log(`sync-clay lookup: incoming id="${id}"`);

  if (!id) {
    console.log('sync-clay lookup: missing id parameter');
    return new Response(JSON.stringify({ success: false, error: 'Missing required id parameter' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('hubspot_account_id', id)
    .maybeSingle();

  if (error) {
    console.error('sync-clay lookup: db error', error.message);
    const safe = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ success: false, error: safe.message, code: safe.code }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!data) {
    console.log(`sync-clay lookup: no record for hubspot_account_id=${id}`);
    return new Response(JSON.stringify({ success: false, error: 'No record found for HubSpot Account ID' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`sync-clay lookup: match for hubspot_account_id=${id} -> account id=${data.id}`);
  return new Response(JSON.stringify({ success: true, record: data }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleList(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get('limit') || '1000', 10);
  const limit = isNaN(limitRaw) ? 1000 : Math.max(1, Math.min(1000, limitRaw));
  const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);
  const updatedSince = url.searchParams.get('updated_since');
  const status = url.searchParams.get('status');
  const hasSfId = url.searchParams.get('has_hubspot_id');

  const ALLOWED_STATUSES = ['account', 'active', 'at-risk', 'churned', 'expansion', 'flex-tier', 'lost', 'inactive'];
  if (status && !ALLOWED_STATUSES.includes(status)) {
    return new Response(JSON.stringify({ success: false, error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (updatedSince && isNaN(Date.parse(updatedSince))) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid updated_since (must be ISO timestamp)' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const columns = [
    'id', 'hubspot_account_id', 'clay_record_id',
    'company_name', 'contact_name', 'job_title', 'email', 'phone', 'linkedin_url', 'website',
    'full_address', 'city', 'state', 'zip_code', 'latitude', 'longitude',
    'industry', 'account_status', 'priority', 'rating',
    'icp_fit_score', 'estimated_deal_size', 'visit_count',
    'last_visit_date', 'next_follow_up_date', 'enrichment_date',
    'updated_at', 'created_at',
  ].join(',');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let query = supabase.from('accounts').select(columns, { count: 'exact' });

  if (updatedSince) query = query.gte('updated_at', updatedSince);
  if (status) query = query.eq('account_status', status);
  if (hasSfId === 'true') query = query.not('hubspot_account_id', 'is', null);
  if (hasSfId === 'false') query = query.is('hubspot_account_id', null);

  query = query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('sync-clay list error:', error);
    const safe = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ success: false, error: safe.message, code: safe.code }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const records = data || [];
  const total = count ?? records.length;
  return new Response(JSON.stringify({
    success: true,
    count: total,
    limit,
    offset,
    has_more: offset + records.length < total,
    records,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleStats(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = isNaN(limitRaw) ? 50 : Math.max(1, Math.min(500, limitRaw));
  const since = url.searchParams.get('since');
  if (since && isNaN(Date.parse(since))) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid since (must be ISO timestamp)' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let query = supabase
    .from('clay_sync_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (since) query = query.gte('created_at', since);

  const { data, error } = await query;
  if (error) {
    console.error('sync-clay stats error:', error);
    const safe = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ success: false, error: safe.message, code: safe.code }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const records = data || [];
  const totals = records.reduce((acc, r: Record<string, number>) => ({
    rows_received: acc.rows_received + (r.rows_received || 0),
    inserted: acc.inserted + (r.inserted || 0),
    updated: acc.updated + (r.updated || 0),
    dropped_duplicates: acc.dropped_duplicates + (r.dropped_duplicates || 0),
    validation_errors: acc.validation_errors + (r.validation_errors || 0),
    update_errors: acc.update_errors + (r.update_errors || 0),
  }), { rows_received: 0, inserted: 0, updated: 0, dropped_duplicates: 0, validation_errors: 0, update_errors: 0 });

  return new Response(JSON.stringify({ success: true, count: records.length, totals, records }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Count how many rows in the incoming batch would hit existing accounts (i.e. become updates
// instead of inserts). Helps explain why a "successful" Clay push doesn't grow the row count.
async function preflightDuplicateCounts(
  supabase: ReturnType<typeof createClient>,
  rows: Array<{ clay_record_id: string | null; company_name: string; full_address: string }>,
): Promise<number> {
  let count = 0;

  const clayIds = Array.from(new Set(rows.map(r => r.clay_record_id).filter((v): v is string => !!v)));
  if (clayIds.length > 0) {
    // Chunk to keep the IN list reasonable
    for (let i = 0; i < clayIds.length; i += 500) {
      const slice = clayIds.slice(i, i + 500);
      const { data } = await supabase
        .from('accounts')
        .select('clay_record_id')
        .in('clay_record_id', slice);
      count += (data?.length ?? 0);
    }
  }

  const addrKeys = rows
    .filter(r => !r.clay_record_id && r.company_name && r.full_address)
    .map(r => ({ company_name: r.company_name, full_address: r.full_address }));
  if (addrKeys.length > 0) {
    const companies = Array.from(new Set(addrKeys.map(k => k.company_name)));
    for (let i = 0; i < companies.length; i += 200) {
      const slice = companies.slice(i, i + 200);
      const { data } = await supabase
        .from('accounts')
        .select('company_name, full_address')
        .in('company_name', slice);
      const existing = new Set((data || []).map((r: { company_name: string; full_address: string }) => `${r.company_name}||${r.full_address}`));
      for (const k of addrKeys) {
        if (slice.includes(k.company_name) && existing.has(`${k.company_name}||${k.full_address}`)) {
          count += 1;
        }
      }
    }
  }

  return count;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' } });
  }

  try {
    if (!validateApiKey(req)) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /lookup → fetch by hubspot_account_id; GET /list → paginated list; GET /stats → recent sync runs
    if (req.method === 'GET') {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/lookup')) {
        return await handleLookup(req);
      }
      if (path.endsWith('/list')) {
        return await handleList(req);
      }
      if (path.endsWith('/stats')) {
        return await handleStats(req);
      }
      return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    const requestId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sourceIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ success: false, error: 'Payload too large', request_id: requestId }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server configuration missing');

    const payload = await req.json();
    const rawRows = Array.isArray(payload) ? payload : [payload];

    if (rawRows.length > 500) {
      return new Response(JSON.stringify({ success: false, error: 'Batch too large. Maximum 500 rows per request.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rawRows.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0, message: 'No rows to sync' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validationErrors: string[] = [];
    const validatedRows: Record<string, unknown>[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const result = ClayRowSchema.safeParse(rawRows[i]);
      if (!result.success) validationErrors.push(`Row ${i}: invalid format`);
      else validatedRows.push(result.data as Record<string, unknown>);
    }

    if (validatedRows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'All rows failed validation', validationErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Split rows: those with a UUID `id` (update path) vs those without (insert/upsert path).
    const updateRows: { id: string; data: Record<string, unknown> }[] = [];
    const insertRows: Record<string, unknown>[] = [];

    for (let i = 0; i < validatedRows.length; i++) {
      const row = validatedRows[i];
      const idRaw = pick(row, ['id', 'Id', 'ID', 'account_id', 'Account ID']);
      if (idRaw !== undefined && idRaw !== null && idRaw !== '') {
        const idStr = String(idRaw).trim();
        if (!UUID_RE.test(idStr)) {
          validationErrors.push(`Row ${i}: \`id\` is not a valid UUID`);
          continue;
        }
        const partial = buildPartialUpdate(row);
        partial.enrichment_date = new Date().toISOString();
        updateRows.push({ id: idStr, data: partial });
      } else {
        insertRows.push(row);
      }
    }

    let updated = 0;
    let inserted = 0;
    let geocoded = 0;
    const updateErrors: string[] = [];

    // ---- UPDATE PATH: partial update by accounts.id ----
    for (const { id, data } of updateRows) {
      if (Object.keys(data).length === 0) continue;
      const { error, count } = await supabase
        .from('accounts')
        .update(data, { count: 'exact' })
        .eq('id', id);
      if (error) {
        console.error(`Update failed for id=${id}:`, error.message);
        updateErrors.push(`id ${id}: ${error.message}`);
      } else {
        updated += count ?? 1;
      }
    }

    // ---- INSERT PATH: brand-new Clay rows (no id) ----
    if (insertRows.length > 0) {
      const accountsToInsert = await Promise.all(insertRows.map(async (row) => {
        let latitude = sanitizeNumber(pick(row, ['Latitude', 'Lat', 'latitude', 'lat']), -90, 90);
        let longitude = sanitizeNumber(pick(row, ['Longitude', 'Long', 'Lng', 'longitude', 'long', 'lng']), -180, 180);

        const street = sanitizeString(pick(row, ['Street', 'street']), 500) || '';
        const fullAddress = sanitizeString(pick(row, ['Full Address', 'Address', 'full_address', 'address']), 500) || street;
        const city = sanitizeString(pick(row, ['City', 'city']), 100) || '';
        const state = sanitizeString(pick(row, ['State', 'state']), 50) || '';
        const zipCode = sanitizeString(pick(row, ['Zip Code', 'Zip', 'zip_code', 'zip']), 20) || '';

        if ((latitude === null || longitude === null) && MAPBOX_ACCESS_TOKEN) {
          const streetPart = (fullAddress || street || '').trim();
          const cityStateZipPart = [city, state].filter(Boolean).join(', ') + (zipCode ? ` ${zipCode}` : '');
          let toGeocode = '';
          if (streetPart && cityStateZipPart.trim()) toGeocode = `${streetPart}, ${cityStateZipPart}`;
          else if (streetPart) toGeocode = streetPart;
          else if (cityStateZipPart.trim()) toGeocode = cityStateZipPart;
          if (toGeocode) {
            const g = await geocodeAddress(toGeocode, MAPBOX_ACCESS_TOKEN);
            latitude = g.latitude;
            longitude = g.longitude;
          }
        }

        const firstName = sanitizeString(pick(row, ['contact_first_name', 'Contact first Name', 'Contact First Name', 'Contact first name', 'First Name', 'First name', 'first_name', 'first name']), 100) || '';
        const lastName = sanitizeString(pick(row, ['contact_last_name', 'Contact Last Name', 'Contact last name', 'Last Name', 'Last name', 'last_name', 'last name']), 100) || '';
        const combined = `${firstName} ${lastName}`.trim();

        return {
          clay_record_id: sanitizeString(pick(row, ['clay_record_id', 'Clay Record ID', 'Clay Record Id']), 255),
          company_name: sanitizeRequiredString(pick(row, ['Company Name', 'Company', 'company_name', 'company']), 255, 'Unknown Company'),
          contact_name: sanitizeRequiredString(pick(row, ['Contact Name', 'Contact name', 'contact_name', 'contact name', 'Name', 'name', 'Full Name', 'Full name', 'full_name', 'Person Name', 'Person name']) ?? combined, 255, 'Unknown Contact'),
          job_title: sanitizeString(pick(row, ['contact_title', 'Job Title', 'Contact Title', 'Title', 'job_title', 'title']), 255),
          email: sanitizeEmail(pick(row, ['Email', 'email'])),
          phone: sanitizeString(pick(row, ['contact_phone_number', 'Phone', 'Contact Phone Number', 'Phone Number', 'phone']), 50),
          linkedin_url: sanitizeString(pick(row, ['LinkedIn URL', 'linkedin_url']), 500),
          website: sanitizeString(pick(row, ['Website', 'website']), 500),
          full_address: fullAddress || `${street}, ${city}, ${state} ${zipCode}`.trim().replace(/^,\s*/, ''),
          city, state, zip_code: zipCode, latitude, longitude,
          industry: normalizeIndustry(sanitizeString(pick(row, ['Industry', 'industry']), 100)),
          account_status: normalizeStatus(sanitizeString(pick(row, ['Account Status', 'Status', 'account_status', 'status']), 100)),
          priority: normalizePriority(sanitizeString(pick(row, ['Priority', 'priority']), 50)),
          notes: sanitizeString(pick(row, ['Notes', 'notes']), 5000),
          estimated_deal_size: sanitizeNumber(pick(row, ['Estimated Deal Size', 'Deal Size', 'estimated_deal_size', 'deal_size']), 0, 999999999),
          last_posting_description: sanitizeString(pick(row, ['Last Posting', 'Last Posting Description', 'last_posting_description', 'last_posting']), 2000),
          last_posting_author: sanitizeString(pick(row, ['Who Posted', 'Last Posting Author', 'last_posting_author', 'who_posted']), 255),
          last_posting_date: sanitizeString(pick(row, ['Last Posting Date', 'last_posting_date']), 50),
          postings_per_month: sanitizeNumber(pick(row, ['Postings Per Month', 'Postings/Month', 'postings_per_month']), 0, 99999),
          pay_rate: sanitizeNumber(pick(row, ['Pay Rate', 'pay_rate']), 0, 999999),
          icp_fit_score: sanitizeNumber(pick(row, ['ICP Fit Score', 'ICP Score', 'icp_fit_score', 'icp_score']), 0, 100),
          hubspot_account_id: sanitizeString(pick(row, ['hubspot_id', 'HubSpot ID', 'HubSpot Id', 'hubspot_account_id', 'HubSpot Account ID', 'SF ID', 'sf_id']), 100),
          rating: normalizeRating(sanitizeString(pick(row, ['Rating', 'rating']), 50)),
          enrichment_date: new Date().toISOString(),
        };
      }));

      geocoded = accountsToInsert.filter(l => l.latitude !== null && l.longitude !== null).length;

      // Split rows by which unique constraint they conflict on:
      // - rows with clay_record_id → upsert on clay_record_id (avoids unique violation
      //   when company/address changes on an existing Clay record)
      // - rows without clay_record_id → upsert on (company_name, full_address)
      const withClayId = accountsToInsert.filter(l => l.clay_record_id);
      const withoutClayId = accountsToInsert.filter(l => !l.clay_record_id);

      // Dedupe in-batch (last occurrence wins) to avoid
      // "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const dedupe = <T>(rows: T[], keyFn: (r: T) => string): T[] => {
        const map = new Map<string, T>();
        for (const r of rows) map.set(keyFn(r), r);
        return Array.from(map.values());
      };
      const dedupedClay = dedupe(withClayId, l => String(l.clay_record_id));
      const dedupedAddr = dedupe(withoutClayId, l => `${l.company_name}||${l.full_address}`);

      const insertErrors: string[] = [];

      const runUpsert = async (rows: typeof accountsToInsert, onConflict: string) => {
        if (rows.length === 0) return;
        const { error } = await supabase
          .from('accounts')
          .upsert(rows, { onConflict, ignoreDuplicates: false })
          .select();
        if (!error) {
          inserted += rows.length;
          return;
        }
        // Batch failed — log full detail and retry per-row so one bad record doesn't kill the batch.
        console.error(`Batch upsert failed (onConflict=${onConflict}):`, JSON.stringify({
          message: error.message,
          code: (error as { code?: string }).code,
          details: (error as { details?: string }).details,
          hint: (error as { hint?: string }).hint,
        }));
        for (const row of rows) {
          const { error: rowErr } = await supabase
            .from('accounts')
            .upsert([row], { onConflict, ignoreDuplicates: false })
            .select();
          if (rowErr) {
            const label = row.clay_record_id || `${row.company_name} @ ${row.full_address}`;
            console.error(`Row upsert failed [${label}]:`, JSON.stringify({
              message: rowErr.message,
              code: (rowErr as { code?: string }).code,
              details: (rowErr as { details?: string }).details,
              hint: (rowErr as { hint?: string }).hint,
            }));
            insertErrors.push(`${label}: ${rowErr.message}`);
          } else {
            inserted += 1;
          }
        }
      };

      await runUpsert(dedupedClay, 'clay_record_id');
      await runUpsert(dedupedAddr, 'company_name,full_address');

      if (insertErrors.length) updateErrors.push(...insertErrors);
    }

    // Compute how many insert-path rows would hit existing accounts (i.e. become updates rather
    // than new inserts). This is the most common reason a "successful" Clay push doesn't grow
    // the row count.
    let wouldBeUpdates = 0;
    let droppedDuplicates = 0;
    try {
      const preflightRows = insertRows.map((row) => ({
        clay_record_id: sanitizeString(pick(row, ['clay_record_id', 'Clay Record ID', 'Clay Record Id']), 255),
        company_name: sanitizeRequiredString(pick(row, ['Company Name', 'Company', 'company_name', 'company']), 255, 'Unknown Company'),
        full_address: sanitizeString(pick(row, ['Full Address', 'Address', 'full_address', 'address']), 500) || sanitizeString(pick(row, ['Street', 'street']), 500) || '',
      }));
      wouldBeUpdates = await preflightDuplicateCounts(supabase, preflightRows);

      // In-batch dedupe dropped count
      const seenClay = new Set<string>();
      const seenAddr = new Set<string>();
      for (const r of preflightRows) {
        if (r.clay_record_id) {
          if (seenClay.has(r.clay_record_id)) droppedDuplicates += 1;
          else seenClay.add(r.clay_record_id);
        } else if (r.company_name && r.full_address) {
          const k = `${r.company_name}||${r.full_address}`;
          if (seenAddr.has(k)) droppedDuplicates += 1;
          else seenAddr.add(k);
        }
      }
    } catch (e) {
      console.error('Preflight duplicate count failed:', e);
    }

    const rowsReceived = rawRows.length;
    const rowsAfterDedupe = validatedRows.length - droppedDuplicates;

    console.log(`sync-clay[${requestId}]: received=${rowsReceived} after_dedupe=${rowsAfterDedupe} would_be_updates=${wouldBeUpdates} dropped_dupes=${droppedDuplicates} updated=${updated} inserted=${inserted} geocoded=${geocoded} skipped=${validationErrors.length}`);

    // Best-effort persistent log so we can debug Clay sync gaps after edge-function logs expire.
    try {
      await supabase.from('clay_sync_log').insert({
        request_id: requestId,
        rows_received: rowsReceived,
        rows_after_dedupe: rowsAfterDedupe,
        dropped_duplicates: droppedDuplicates,
        would_be_updates: wouldBeUpdates,
        inserted,
        updated,
        geocoded,
        validation_errors: validationErrors.length,
        update_errors: updateErrors.length,
        http_status: 200,
        source_ip: sourceIp,
        user_agent: userAgent,
      });
    } catch (e) {
      console.error('Failed to write clay_sync_log:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      request_id: requestId,
      rows_received: rowsReceived,
      rows_after_dedupe: rowsAfterDedupe,
      dropped_duplicates: droppedDuplicates,
      would_be_updates: wouldBeUpdates,
      updated,
      inserted,
      synced: updated + inserted,
      geocoded,
      skipped: validationErrors.length,
      validationErrors: validationErrors.length ? validationErrors : undefined,
      updateErrors: updateErrors.length ? updateErrors : undefined,
      message: `Received ${rowsReceived}, inserted ${inserted}, updated ${updated}. ${wouldBeUpdates} row(s) matched existing accounts; ${droppedDuplicates} were duplicates within this batch.`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const safe = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ success: false, error: safe.message, code: safe.code }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
