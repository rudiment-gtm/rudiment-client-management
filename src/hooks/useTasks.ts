import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Task } from '@/types/workflow';

// Joined in for display — the account name each task's title already
// includes, but the row also needs it for grouping/rendering independent of
// the title string.
export interface TaskWithAccount extends Task {
  account_name: string;
}

export function useTasks() {
  return useQuery<TaskWithAccount[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, accounts(account_name)')
        .order('due_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        account_name: row.accounts?.account_name ?? 'Account',
      })) as TaskWithAccount[];
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: done ? 'done' : 'upcoming', completed_at: done ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
