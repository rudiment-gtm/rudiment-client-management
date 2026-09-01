import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/AuthProvider';
import { toast } from 'sonner';

// meetings was added after types generation (see
// integrations/supabase/types.ts) — cast to any, same pattern as
// lib/savedRoutes.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  attendees: string | null;
  content_html: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['meetings'];

export function useMeetings() {
  return useQuery<Meeting[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await db
        .from('meetings')
        .select('*')
        .order('meeting_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Meeting[];
    },
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db
        .from('meetings')
        .insert({
          title: 'Untitled meeting',
          meeting_date: new Date().toISOString().slice(0, 10),
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Meeting;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to create meeting: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Meeting, 'title' | 'meeting_date' | 'attendees' | 'content_html'>> }) => {
      const { error } = await db.from('meetings').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to save meeting: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('meetings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to delete meeting: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}
