import { supabase } from '@/integrations/supabase/client';
import type { RouteStop } from '@/store/appStore';

export type SharedRoutePayload = {
  stops: RouteStop[];
  origin?: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Create a shareable route. Returns the short code and full URL. */
export async function createSharedRoute(payload: SharedRoutePayload): Promise<{ code: string; url: string }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error('You must be signed in to share a route.');

  const { data: codeData, error: codeErr } = await db.rpc('generate_route_share_code');
  if (codeErr) throw codeErr;
  const code = codeData as string;

  const { error: insertErr } = await db.from('shared_routes').insert({
    code,
    created_by: userData.user.id,
    stops: payload.stops,
    origin: payload.origin ?? null,
  });
  if (insertErr) throw insertErr;

  const url = `${window.location.origin}/r/${code}`;
  return { code, url };
}

/** Fetch a shared route snapshot by code. Returns null when missing/expired. */
export async function loadSharedRoute(code: string): Promise<SharedRoutePayload | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await db
    .from('shared_routes')
    .select('stops, origin')
    .eq('code', normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { stops: data.stops as RouteStop[], origin: data.origin };
}
