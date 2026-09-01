import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EmailSequence, SequenceStep } from '@/types/emailSequence';
import type { FilterGroup } from '@/types/filters';
import type { Account } from '@/types/account';

export function useEmailSequences() {
  return useQuery<EmailSequence[]>({
    queryKey: ['email_sequences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_sequences')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmailSequence[];
    },
  });
}

export interface SequenceDraft {
  name: string;
  filter_groups: FilterGroup[];
  steps: SequenceStep[];
}

export function useCreateSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: SequenceDraft) => {
      const { data: userData } = await supabase.auth.getUser();
      // filter_groups/steps are specific interfaces, not the generic Json
      // shape the hand-written Database type expects for jsonb columns —
      // same pre-existing typegen gap documented in useAccounts.ts.
      const { data, error } = await (supabase.from('email_sequences') as any)
        .insert({ ...draft, created_by: userData.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EmailSequence;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_sequences'] });
    },
  });
}

export function useUpdateSequenceDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SequenceDraft> }) => {
      const { error } = await (supabase.from('email_sequences') as any).update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_sequences'] });
    },
  });
}

export function useDeleteSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_sequences').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_sequences'] });
    },
  });
}

// Creates/updates the real EmailBison campaign + sequence content for this
// row (via the emailbison-save-sequence edge function), then re-fetches so
// the caller sees the freshly stored emailbison_campaign_id/step ids.
export function useSaveSequenceToEmailBison() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sequenceId: string) => {
      const { data, error } = await supabase.functions.invoke('emailbison-save-sequence', {
        body: { sequenceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: true; emailbisonCampaignId: number; emailbisonSequenceId: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_sequences'] });
    },
  });
}

export interface PushableLead {
  email: string;
  first_name: string;
  last_name?: string;
  title?: string;
  company?: string;
}

export function accountToLead(account: Account): PushableLead | null {
  if (!account.mainEmail) return null;
  return {
    email: account.mainEmail,
    first_name: account.firstName || account.accountName,
    last_name: account.lastName,
    title: account.jobTitle,
    company: account.accountName,
  };
}

export function useEmailBisonPushLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sequenceId, leads }: { sequenceId: string; leads: PushableLead[] }) => {
      const { data, error } = await supabase.functions.invoke('emailbison-push-leads', {
        body: { sequenceId, leads },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: true; pushed: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_sequences'] });
    },
  });
}
