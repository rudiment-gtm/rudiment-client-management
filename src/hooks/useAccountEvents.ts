import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AccountEvent {
  id: string;
  account_id: string;
  event_type: string;
  notes: string | null;
  assigned_to: string;
  author_name: string;
  author_user_id: string;
  start_at: string;
  end_at: string;
  occurred_at: string;
  created_at: string;
  // "Quote Created" event fields — only populated when event_type === 'Quote Created'
  quote_services: string[] | null;
  quote_price_usd: number | null;
  quote_number: string | null;
}

export function useAccountEvents(accountId: string | undefined) {
  return useQuery<AccountEvent[]>({
    queryKey: ['account_events', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from('account_events')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as AccountEvent[];
    },
    enabled: !!accountId,
  });
}
