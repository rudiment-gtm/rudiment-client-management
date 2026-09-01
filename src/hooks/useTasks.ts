import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/AuthProvider';
import { toast } from 'sonner';

// internal_tasks was added after types generation (see
// integrations/supabase/types.ts) — cast to any, same pattern as
// lib/savedRoutes.ts. Standalone tasks, no account relation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface InternalTask {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  owner: string | null;
  status: 'Not Started' | 'In Progress' | 'Done';
  created_by: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['internal-tasks'];

export function useTasks() {
  return useQuery<InternalTask[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await db
        .from('internal_tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InternalTask[];
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  return useMutation({
    mutationFn: async (draft: { title: string; due_date?: string | null; owner?: string | null }) => {
      const { error } = await db.from('internal_tasks').insert({
        title: draft.title,
        due_date: draft.due_date || null,
        owner: draft.owner || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to add task: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<InternalTask, 'title' | 'notes' | 'owner' | 'due_date' | 'status'>> }) => {
      const { error } = await db.from('internal_tasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to update task: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await db
        .from('internal_tasks')
        .update({ status: done ? 'Done' : 'Not Started' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('internal_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to delete task: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}
