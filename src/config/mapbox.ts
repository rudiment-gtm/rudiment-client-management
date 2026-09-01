import { supabase } from "@/integrations/supabase/client";

// Mutable holder. Starts empty; populated by loadMapboxToken() on app boot.
export let MAPBOX_ACCESS_TOKEN: string =
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ?? "";

let loadPromise: Promise<string> | null = null;

export function loadMapboxToken(): Promise<string> {
  if (MAPBOX_ACCESS_TOKEN) return Promise.resolve(MAPBOX_ACCESS_TOKEN);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-mapbox-token");
      if (error) throw error;
      const token = (data as { token?: string } | null)?.token ?? "";
      if (!token) {
        console.error("[mapbox] get-mapbox-token returned empty token");
      }
      MAPBOX_ACCESS_TOKEN = token;
      return token;
    } catch (e) {
      console.error("[mapbox] failed to load token from edge function", e);
      return "";
    }
  })();
  return loadPromise;
}
