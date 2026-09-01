import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/appStore';
import { toast } from 'sonner';

export interface Tag {
  id: string;
  label: string;
  color: string;
}

// Every tag, shared across all accounts (a global taxonomy the team builds
// up together — not per-account free text).
export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('label');
      if (error) throw error;
      return data as Tag[];
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, color }: { label: string; color: string }) => {
      const { data, error } = await supabase
        .from('tags')
        .insert({ label: label.trim(), color })
        .select()
        .single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err) => {
      toast.error(`Failed to create tag: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}

// Tag ids attached to one account.
export function useAccountTags(accountId: string | undefined) {
  return useQuery<string[]>({
    queryKey: ['account_tags', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from('account_tags')
        .select('tag_id')
        .eq('account_id', accountId);
      if (error) throw error;
      return (data ?? []).map((r) => r.tag_id);
    },
    enabled: !!accountId,
  });
}

export function useAddTagToAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, tagId }: { accountId: string; tagId: string }) => {
      const { error } = await supabase.from('account_tags').insert({ account_id: accountId, tag_id: tagId });
      if (error) throw error;
      return { accountId, tagId };
    },
    onSuccess: ({ accountId, tagId }) => {
      queryClient.invalidateQueries({ queryKey: ['account_tags', accountId] });
      const store = useAppStore.getState();
      const account = store.accounts.find((a) => a.id === accountId) ?? store.selectedAccount;
      if (account && !account.tags.includes(tagId)) {
        store.updateAccountFields(accountId, { tags: [...account.tags, tagId] });
      }
    },
    onError: (err) => {
      toast.error(`Failed to add tag: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}

export function useRemoveTagFromAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, tagId }: { accountId: string; tagId: string }) => {
      const { error } = await supabase
        .from('account_tags')
        .delete()
        .eq('account_id', accountId)
        .eq('tag_id', tagId);
      if (error) throw error;
      return { accountId, tagId };
    },
    onSuccess: ({ accountId, tagId }) => {
      queryClient.invalidateQueries({ queryKey: ['account_tags', accountId] });
      const store = useAppStore.getState();
      const account = store.accounts.find((a) => a.id === accountId) ?? store.selectedAccount;
      if (account) {
        store.updateAccountFields(accountId, { tags: account.tags.filter((id) => id !== tagId) });
      }
    },
    onError: (err) => {
      toast.error(`Failed to remove tag: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}

// Custom activity types reps add on top of the built-in list (Change 3.1).
export function useCustomActivityTypes() {
  return useQuery<string[]>({
    queryKey: ['activity_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_types').select('label').order('label');
      if (error) throw error;
      return (data ?? []).map((r) => r.label);
    },
  });
}

export function useCreateActivityType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const { data, error } = await supabase
        .from('activity_types')
        .insert({ label: label.trim() })
        .select()
        .single();
      if (error) throw error;
      return data.label as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity_types'] });
    },
    onError: (err) => {
      toast.error(`Failed to create activity type: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}
