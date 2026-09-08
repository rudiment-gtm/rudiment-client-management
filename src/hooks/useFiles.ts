import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/AuthProvider';
import { FileRecord, FileCategory } from '@/types/file';
import { toast } from 'sonner';

// `files` was added after types generation (see integrations/supabase/types.ts)
// — cast to any, same pattern as lib/savedRoutes.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const QUERY_KEY = ['files'];

export function useFiles() {
  return useQuery<FileRecord[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await db
        .from('files')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FileRecord[];
    },
  });
}

export interface CreateFileDraft {
  title: string;
  category: FileCategory;
  description?: string | null;
  content?: string | null;
  link_url?: string | null;
  intake_data?: Record<string, unknown> | null;
}

export function useCreateFile() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  return useMutation({
    mutationFn: async (draft: CreateFileDraft) => {
      const { data, error } = await db
        .from('files')
        .insert({
          title: draft.title,
          category: draft.category,
          description: draft.description ?? null,
          content: draft.content ?? null,
          link_url: draft.link_url ?? null,
          intake_data: draft.intake_data ?? null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FileRecord;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to save file: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('files').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to delete file: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}
