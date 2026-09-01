import { supabase } from '@/integrations/supabase/client';
import type { RouteStop } from '@/store/appStore';

// The saved_routes table was added after types generation; cast to any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SavedRoute = {
  id: string;
  name: string;
  stops: RouteStop[];
  origin: unknown | null;
  created_at: string;
  updated_at: string;
};

export async function listSavedRoutes(): Promise<SavedRoute[]> {
  const { data, error } = await db
    .from('saved_routes')
    .select('id, name, stops, origin, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedRoute[];
}

export async function createSavedRoute(input: {
  name: string;
  stops: RouteStop[];
  origin?: unknown;
}): Promise<SavedRoute> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error('You must be signed in to save a route.');
  const { data, error } = await db
    .from('saved_routes')
    .insert({
      user_id: userData.user.id,
      name: input.name,
      stops: input.stops,
      origin: input.origin ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as SavedRoute;
}

export async function updateSavedRoute(
  id: string,
  patch: Partial<Pick<SavedRoute, 'name' | 'stops' | 'origin'>>,
): Promise<void> {
  const { error } = await db.from('saved_routes').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteSavedRoute(id: string): Promise<void> {
  const { error } = await db.from('saved_routes').delete().eq('id', id);
  if (error) throw error;
}
