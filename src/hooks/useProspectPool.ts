import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PoolCompany {
  id: string;
  company_name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  source: 'seed' | 'import';
  created_at: string;
}

export function useProspectPool() {
  return useQuery<PoolCompany[]>({
    queryKey: ['prospect_pool_companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospect_pool_companies')
        .select('*')
        .order('company_name', { ascending: true });
      if (error) throw error;
      return data as PoolCompany[];
    },
  });
}

export function useImportPoolCompanies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<PoolCompany, 'id' | 'created_at' | 'source'>[]) => {
      const { data, error } = await supabase
        .from('prospect_pool_companies')
        .insert(rows.map((r) => ({ ...r, source: 'import' })))
        .select('id, company_name');
      if (error) throw error;
      return data as { id: string; company_name: string }[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospect_pool_companies'] });
    },
  });
}

// Promotes a pool company to a real account (status: 'lead') the first time
// a rep pushes a found contact for it — dedups by name+address the same way
// useCreateAccountFromAroundMe does, in case the same pool company gets
// pushed twice.
export function useCreateAccountFromPoolCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (company: PoolCompany): Promise<{ id: string; accountName: string }> => {
      const { data: existing } = await supabase
        .from('accounts')
        .select('id, account_name')
        .ilike('account_name', company.company_name)
        .ilike('route_address', company.address || '')
        .limit(1);
      if (existing && existing.length) {
        const row = existing[0] as unknown as { id: string; account_name: string };
        return { id: row.id, accountName: row.account_name };
      }

      const { data: inserted, error } = await (supabase.from('accounts') as any)
        .insert({
          account_name: company.company_name,
          route_address: company.address,
          route_city: company.city,
          route_state: company.state,
          latitude: company.latitude,
          longitude: company.longitude,
          website: company.website,
          main_phone: company.phone,
          account_status: 'lead',
          visit_count: 0,
          account_notes: `Sourced from the Prospect tab (${company.category || 'uncategorized'}).`,
        })
        .select('id, account_name')
        .single();
      if (error) throw error;
      const row = inserted as unknown as { id: string; account_name: string };
      return { id: row.id, accountName: row.account_name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
