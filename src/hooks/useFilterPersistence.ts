import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/appStore';
import { useAuthContext } from '@/components/AuthProvider';
import type { FilterGroup } from '@/types/filters';

/**
 * Hydrates the user's saved advanced filters from `profiles.advanced_filters`
 * on sign-in, and debounce-persists local changes back to the server so
 * filters survive logouts and cross-device sessions.
 */
export function useFilterPersistence() {
  const { user } = useAuthContext();
  const setAdvancedFilters = useAppStore((s) => s.setAdvancedFilters);
  const setFiltersHydrated = useAppStore((s) => s.setFiltersHydrated);

  const lastUserId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate when the signed-in user changes.
  useEffect(() => {
    const userId = user?.id ?? null;

    if (!userId) {
      lastUserId.current = null;
      setFiltersHydrated(false);
      setAdvancedFilters([]);
      return;
    }

    if (lastUserId.current === userId) return;
    lastUserId.current = userId;
    setFiltersHydrated(false);

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('advanced_filters')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.advanced_filters) {
        const groups = data.advanced_filters as unknown as FilterGroup[];
        setAdvancedFilters(Array.isArray(groups) ? groups : []);
      } else {
        setAdvancedFilters([]);
      }
      setFiltersHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, setAdvancedFilters, setFiltersHydrated]);

  // Persist on change, debounced. Gated on hydration so we never clobber the
  // server copy with the initial empty default.
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prev) => {
      if (!state.filtersHydrated) return;
      if (state.advancedFilters === prev.advancedFilters) return;
      const userId = lastUserId.current;
      if (!userId) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      const snapshot = state.advancedFilters;
      saveTimer.current = setTimeout(async () => {
        await supabase
          .from('profiles')
          .update({ advanced_filters: snapshot as unknown as any })
          .eq('user_id', userId);
      }, 400);
    });
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);
}
