import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/AuthProvider';
import { Workflow, TriggerType, TriggerConfig, WorkflowConditions, WorkflowStep } from '@/types/workflow';
import { toast } from 'sonner';

export function useWorkflows() {
  return useQuery<Workflow[]>({
    queryKey: ['workflows'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workflows').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Workflow[];
    },
  });
}

export interface WorkflowDraft {
  name: string;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  conditions: WorkflowConditions;
  steps: WorkflowStep[];
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  return useMutation({
    mutationFn: async ({ draft, status }: { draft: WorkflowDraft; status: 'draft' | 'active' }) => {
      const { data, error } = await supabase
        .from('workflows')
        .insert({ ...draft, status, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Workflow;
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success(status === 'active' ? 'Workflow turned on' : 'Draft saved');
    },
    onError: (err) => {
      toast.error(`Failed to save workflow: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<WorkflowDraft> & { status?: 'draft' | 'active' } }) => {
      const { error } = await supabase.from('workflows').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow updated');
    },
    onError: (err) => {
      toast.error(`Failed to update workflow: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}

export interface SlackConnectionInfo {
  connected: boolean;
  team?: string;
  channels: { id: string; name: string }[];
}

// Encore only ever has one Slack workspace connected (a bot token, no OAuth
// install) — this reports whether SLACK_BOT_TOKEN is set and, if so, the
// real channel list for the Alert step's picker.
export function useSlackConnection() {
  return useQuery<SlackConnectionInfo>({
    queryKey: ['slack-connection'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('slack-channels');
      if (error) throw error;
      return data as SlackConnectionInfo;
    },
    staleTime: 60_000,
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workflows').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err) => {
      toast.error(`Failed to delete workflow: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}
