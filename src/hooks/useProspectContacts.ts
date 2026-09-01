import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProspectContact {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  linkedin_url: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export function useProspectContactsForAccount(accountId: string | undefined) {
  return useQuery<ProspectContact[]>({
    queryKey: ['prospect_contacts', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from('prospect_contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as ProspectContact[];
    },
    enabled: !!accountId,
  });
}

export interface ProspectContactWithAccount extends ProspectContact {
  account_name: string;
}

export function useAllProspectContacts() {
  return useQuery<ProspectContactWithAccount[]>({
    queryKey: ['prospect_contacts', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospect_contacts')
        .select('*, accounts(account_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as (ProspectContact & { accounts: { account_name: string } | null })[]).map((row) => ({
        ...row,
        account_name: row.accounts?.account_name || 'Unknown account',
      }));
    },
  });
}

type ContactPatch = {
  title?: string | null;
  linkedinUrl?: string | null;
  email?: string | null;
  phone?: string | null;
};

// Finds an existing contact by (account, name) and merges in new fields, or
// creates one — the closest equivalent to the original demo's "merge into
// this business's contact map, keyed by name" behavior, but persisted for
// real instead of living only in that one browser's localStorage.
export function useUpsertProspectContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId, firstName, lastName, patch,
    }: { accountId: string; firstName: string; lastName: string; patch: ContactPatch }) => {
      const { data: existing } = await supabase
        .from('prospect_contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('first_name', firstName)
        .eq('last_name', lastName)
        .maybeSingle();

      const fields = {
        title: patch.title,
        linkedin_url: patch.linkedinUrl,
        email: patch.email,
        phone: patch.phone,
      };
      // Only overwrite with defined keys so a reveal-email call doesn't null out a phone already found.
      const definedFields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

      if (existing) {
        const { data, error } = await supabase
          .from('prospect_contacts')
          .update({ ...definedFields, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data as ProspectContact;
      }

      const { data, error } = await supabase
        .from('prospect_contacts')
        .insert({ account_id: accountId, first_name: firstName, last_name: lastName, ...definedFields })
        .select()
        .single();
      if (error) throw error;
      return data as ProspectContact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prospect_contacts', data.account_id] });
      queryClient.invalidateQueries({ queryKey: ['prospect_contacts', 'all'] });
    },
  });
}
