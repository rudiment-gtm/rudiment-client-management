import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'declined' | 'completed';

export interface Quote {
  id: string;
  accountId: string;
  title: string;
  amount: number;
  status: QuoteStatus;
  description?: string;
  validUntil?: string | null;
  hubspotQuoteId?: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToQuote(row: Record<string, any>): Quote {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    amount: Number(row.amount),
    status: row.status,
    description: row.description ?? undefined,
    validUntil: row.valid_until,
    hubspotQuoteId: row.hubspot_quote_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useQuotesForAccount(accountId: string | null) {
  return useQuery({
    queryKey: ['quotes', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('account_id', accountId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToQuote);
    },
  });
}

export function useAddQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; title: string; amount: number; description?: string; validUntil?: string | null }) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          account_id: input.accountId,
          title: input.title,
          amount: input.amount,
          description: input.description ?? null,
          valid_until: input.validUntil ?? null,
          status: 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      return rowToQuote(data);
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', quote.accountId] });
    },
  });
}

export function useUpdateQuoteStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuoteStatus }) => {
      const { data, error } = await supabase
        .from('quotes')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return rowToQuote(data);
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', quote.accountId] });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accountId }: { id: string; accountId: string }) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw error;
      return accountId;
    },
    onSuccess: (accountId) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', accountId] });
    },
  });
}

// Calls the hubspot-create-quote edge function: creates a real HubSpot Quote
// (Deal + Line Item + Quote, associated to the account's Company/Contact),
// then flips local status to 'sent'. This is the map's "new business mode"
// send action from the sold Sales Map System proposal — the Drive-folder/
// Slack automation that follows a real send is n8n's job, wired separately.
export function useSendQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hubspot-create-quote`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ quote_id: quoteId }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? 'Failed to send quote');
      return json as { ok: true; hubspot_quote_id: string; account_id: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', result.account_id] });
    },
  });
}
