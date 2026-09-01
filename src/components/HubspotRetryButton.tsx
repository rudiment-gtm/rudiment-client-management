import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

interface Props {
  accountId: string;
}

export function HubSpotRetryButton({ accountId }: Props) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleRetry = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('hubspot-create-account', {
        body: { account_id: accountId },
      });
      if (error || data?.error) {
        const msg = error?.message || data?.detail || data?.error || 'Sync failed';
        toast.error(`HubSpot sync failed: ${msg}`, { duration: 10000 });
        return;
      }
      if (data?.hubspot_account_id) {
        useAppStore.setState((s) => ({
          accounts: s.accounts.map((l) =>
            l.id === accountId ? { ...l, hubspotAccountId: data.hubspot_account_id } : l,
          ),
          selectedAccount: s.selectedAccount?.id === accountId
            ? { ...s.selectedAccount, hubspotAccountId: data.hubspot_account_id }
            : s.selectedAccount,
        }));
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        toast.success(data.matched
          ? `Linked to existing HubSpot Account: ${data.account_name || ''}`
          : 'Created in HubSpot');
      }
    } catch (e) {
      toast.error(`Sync failed: ${e instanceof Error ? e.message : String(e)}`, { duration: 10000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={loading}
      title="This account isn't in HubSpot yet. Click to sync now."
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <AlertCircle className="w-3 h-3" />
      )}
      <span>Not in HubSpot</span>
      {!loading && <RefreshCw className="w-3 h-3" />}
    </button>
  );
}
