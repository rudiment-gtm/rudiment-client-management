import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Account, AccountStatus, ServiceType, prospectCategoryLabels } from '@/types/account';
import type { AroundMeResult } from '@/lib/aroundMeSearch';

type AccountRow = Database['public']['Tables']['accounts']['Row'];

// NOTE: src/integrations/supabase/types.ts is a hand-written mirror of the
// migration (its own header comment says so) and its Table entries omit
// `Relationships`, which supabase-js's GenericSchema constraint requires.
// That makes the client's mutation (`.update()`/`.insert()`) argument types
// resolve to `never` for every table, not just `accounts` — the same "not
// assignable to parameter of type 'never'" error shows up in
// useAccountNotes.ts, useAuth.ts, useFilterPersistence.ts, and
// savedRoutes.ts today. It's a pre-existing, repo-wide typegen gap, not a
// mapping bug in this file, and fixing it belongs in types.ts (out of scope
// here). The `as any` casts below are a narrow, local workaround scoped to
// each mutation call; every payload key is still hand-verified against the
// `accounts` row shape in the Row-to-Account mapper above.

// Best-effort parse of a Mapbox full_address like
// "123 Main St, Brooklyn, New York 11201, United States"
function parseAddress(full: string): { street: string; city: string; state: string; zip: string } {
  const out = { street: '', city: '', state: '', zip: '' };
  if (!full) return out;
  const parts = full.split(',').map((p) => p.trim()).filter(Boolean);
  // Drop trailing country if it looks like one
  if (parts.length && /^(united states|usa|us)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length >= 1) out.street = parts[0];
  if (parts.length >= 2) out.city = parts[1];
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    // "State ZIP" or just "State"
    const m = last.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      out.state = m[1].trim();
      out.zip = m[2];
    } else {
      out.state = last;
    }
  }
  return out;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Transform a DB `accounts` row into the app-level Account shape.
const transformDbAccount = (row: AccountRow): Account => ({
  id: row.id,

  accountName: row.account_name,
  accountNotes: row.account_notes || undefined,

  services: (row.services || []) as ServiceType[],
  tags: [], // filled in by useAccounts() after a bulk account_tags join

  accountStatus: (row.account_status as AccountStatus) || 'lead',
  cancelDate: row.cancel_date ?? null,

  billingAddress: row.billing_address || undefined,
  billingCity: row.billing_city || undefined,
  billingState: row.billing_state || undefined,
  billingZip: row.billing_zip || undefined,
  routeAddress: row.route_address || undefined,
  routeCity: row.route_city || undefined,
  routeState: row.route_state || undefined,
  routeZip: row.route_zip || undefined,

  latitude: row.latitude ?? 0,
  longitude: row.longitude ?? 0,

  salutation: row.salutation || undefined,
  firstName: row.first_name || undefined,
  middleInitial: row.middle_initial || undefined,
  lastName: row.last_name || undefined,
  primaryContact: row.primary_contact || undefined,
  secondaryContact: row.secondary_contact || undefined,
  jobTitle: row.job_title || undefined,
  mainPhone: row.main_phone || undefined,
  altPhone: row.alt_phone || undefined,
  fax: row.fax || undefined,
  mainEmail: row.main_email || undefined,
  linkedinUrl: row.linkedin_url || undefined,
  website: row.website || undefined,

  visitCount: row.visit_count || 0,
  lastVisitDate: row.last_visit_date || undefined,
  nextFollowUpDate: row.next_follow_up_date || undefined,
  lastContactedAt: row.last_contacted_at ?? null,
  lastContactedSource: row.last_contacted_source ?? null,

  hubspotCompanyId: row.hubspot_company_id || undefined,
  hubspotContactId: row.hubspot_contact_id || undefined,
});

const ACCOUNT_COLUMNS =
  'id,account_name,account_notes,services,account_status,cancel_date,' +
  'billing_address,billing_city,billing_state,billing_zip,route_address,route_city,route_state,route_zip,' +
  'latitude,longitude,salutation,first_name,middle_initial,last_name,primary_contact,secondary_contact,' +
  'job_title,main_phone,alt_phone,fax,main_email,linkedin_url,website,visit_count,last_visit_date,' +
  'next_follow_up_date,last_contacted_at,last_contacted_source,hubspot_company_id,hubspot_contact_id';

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    // Keep results fresh for 60s and don't refetch on window focus — prevents
    // unnecessary churn that would otherwise reset filter state on every focus.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Account[]> => {
      const allAccounts: Account[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      // Fetch in batches to bypass the 1000 row limit
      while (hasMore && offset < 50000) {
        const { data, error } = await supabase
          .from('accounts')
          .select(ACCOUNT_COLUMNS)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const transformedAccounts = ((data || []) as unknown as AccountRow[]).map(transformDbAccount);
        allAccounts.push(...transformedAccounts);

        // If we got fewer records than page size, we've reached the end
        hasMore = data?.length === pageSize;
        offset += pageSize;
      }

      // Bulk-join tags onto each account (a small table — every attach/detach
      // is one row, not one per account) so the map toolbar can filter by tag
      // client-side the same way it already does for status/services.
      const { data: accountTagRows, error: tagsError } = await supabase
        .from('account_tags')
        .select('account_id, tag_id');
      if (tagsError) throw tagsError;

      const tagsByAccount = new Map<string, string[]>();
      for (const row of accountTagRows ?? []) {
        const list = tagsByAccount.get(row.account_id) ?? [];
        list.push(row.tag_id);
        tagsByAccount.set(row.account_id, list);
      }
      for (const account of allAccounts) {
        account.tags = tagsByAccount.get(account.id) ?? [];
      }

      console.log(`[useAccounts] Fetched ${allAccounts.length} total accounts`);
      return allAccounts;
    },
  });
}

// Note: Clay sync now works via webhook push, not pull API
// The sync-clay edge function receives data when Clay sends it

export function useUpdateAccountStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accountId, status }: { accountId: string; status: AccountStatus }) => {
      const { error } = await (supabase.from('accounts') as any)
        .update({ account_status: status })
        .eq('id', accountId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export interface ContactPatch {
  salutation?: string;
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  jobTitle?: string;
  mainPhone?: string;
  altPhone?: string;
  mainEmail?: string;
  website?: string;
  linkedinUrl?: string;
}

export function useUpdateAccountContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accountId, patch }: { accountId: string; patch: ContactPatch }) => {
      const { error } = await (supabase.from('accounts') as any)
        .update({
          salutation: patch.salutation || null,
          first_name: patch.firstName || null,
          middle_initial: patch.middleInitial || null,
          last_name: patch.lastName || null,
          job_title: patch.jobTitle || null,
          main_phone: patch.mainPhone || null,
          alt_phone: patch.altPhone || null,
          main_email: patch.mainEmail || null,
          website: patch.website || null,
          linkedin_url: patch.linkedinUrl || null,
        })
        .eq('id', accountId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useLogVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accountId, notes }: { accountId: string; notes?: string }) => {
      // First get current visit count + notes
      const { data: accountRaw, error: fetchError } = await supabase
        .from('accounts')
        .select('visit_count, account_notes')
        .eq('id', accountId)
        .single();

      if (fetchError) throw fetchError;
      const account = accountRaw as unknown as Pick<AccountRow, 'visit_count' | 'account_notes'> | null;

      const now = new Date().toISOString().split('T')[0];
      const updatedNotes = notes
        ? `${now}: ${notes}\n\n${account?.account_notes || ''}`
        : account?.account_notes;

      const { error } = await (supabase.from('accounts') as any)
        .update({
          visit_count: (account?.visit_count || 0) + 1,
          last_visit_date: now,
          account_notes: updatedNotes,
        })
        .eq('id', accountId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

/**
 * Convert an Around-Me POI search result into a real `accounts` row,
 * deduping against existing accounts by address/name or proximity.
 * Returns the resulting Account (existing or newly inserted).
 */
export function useCreateAccountFromAroundMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (result: AroundMeResult): Promise<Account> => {
      const parsed = parseAddress(result.address);
      const street = parsed.street || result.address || result.name;

      // 1) Dedup by account_name + route_address (case-insensitive)
      const { data: byAddr } = await supabase
        .from('accounts')
        .select(ACCOUNT_COLUMNS)
        .ilike('account_name', result.name)
        .ilike('route_address', street)
        .limit(1);
      if (byAddr && byAddr.length) return transformDbAccount(byAddr[0] as unknown as AccountRow);

      // 2) Dedup by proximity (~30m) — search a small bounding box then haversine
      const latDelta = 0.0005; // ~55m
      const lngDelta = 0.0007;
      const { data: nearby } = await supabase
        .from('accounts')
        .select(ACCOUNT_COLUMNS)
        .gte('latitude', result.latitude - latDelta)
        .lte('latitude', result.latitude + latDelta)
        .gte('longitude', result.longitude - lngDelta)
        .lte('longitude', result.longitude + lngDelta)
        .limit(20);
      if (nearby && nearby.length) {
        const match = (nearby as unknown as AccountRow[]).find((r) => {
          if (r.latitude == null || r.longitude == null) return false;
          return haversineMeters(result.latitude, result.longitude, Number(r.latitude), Number(r.longitude)) <= 30;
        });
        if (match) return transformDbAccount(match);
      }

      // 3) Insert new. Prospect category is only relevant during the Around Me
      // search itself — there's no field on Account to persist it, so it's
      // dropped here; we just fold it into the sourcing note.
      const categoryLabel = prospectCategoryLabels[result.prospectCategory];
      const { data: inserted, error } = await (supabase.from('accounts') as any)
        .insert({
          account_name: result.name,
          route_address: street,
          route_city: parsed.city || '',
          route_state: parsed.state || '',
          route_zip: parsed.zip || '',
          latitude: result.latitude,
          longitude: result.longitude,
          account_status: 'lead',
          visit_count: 0,
          account_notes: `Sourced from Around Me search (${categoryLabel}${result.category ? `: ${result.category}` : ''})`,
        })
        .select(ACCOUNT_COLUMNS)
        .single();
      if (error) throw error;
      return transformDbAccount(inserted as unknown as AccountRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// Normalize an address string for fuzzy dedup matching.
// Lowercase, strip punctuation, collapse whitespace, expand common abbreviations.
export function normalizeAddress(s: string | null | undefined): string {
  if (!s) return '';
  let out = s.toLowerCase();
  out = out.replace(/[.,#]/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  // Common street-suffix abbreviations
  const subs: Array<[RegExp, string]> = [
    [/\bstreet\b/g, 'st'],
    [/\bavenue\b/g, 'ave'],
    [/\broad\b/g, 'rd'],
    [/\bboulevard\b/g, 'blvd'],
    [/\bdrive\b/g, 'dr'],
    [/\bcourt\b/g, 'ct'],
    [/\blane\b/g, 'ln'],
    [/\bhighway\b/g, 'hwy'],
    [/\bparkway\b/g, 'pkwy'],
    [/\bplace\b/g, 'pl'],
    [/\bsuite\b/g, 'ste'],
  ];
  for (const [re, val] of subs) out = out.replace(re, val);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Find an existing account whose route (job-site) address matches the given
 * street + (zip OR city). Used to dedup Around-Me previews before creating a
 * new account.
 */
export async function findAccountByAddress(
  street: string,
  zip: string,
  city: string,
): Promise<Account | null> {
  const target = normalizeAddress(street);
  if (!target) return null;

  // Pull candidates by zip first (cheap and selective), fall back to city.
  let query = supabase
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .limit(200);
  if (zip) query = query.eq('route_zip', zip);
  else if (city) query = query.ilike('route_city', city);
  else return null;

  const { data, error } = await query;
  if (error || !data) return null;

  const match = (data as unknown as AccountRow[]).find((r) => normalizeAddress(r.route_address) === target);
  return match ? transformDbAccount(match) : null;
}
