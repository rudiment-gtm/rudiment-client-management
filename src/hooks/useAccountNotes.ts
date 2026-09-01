import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AccountNote {
  id: string;
  account_id: string;
  note_text: string;
  author_name: string;
  author_user_id: string;
  created_at: string;
}

export function useAccountNotes(accountId: string | undefined) {
  return useQuery<AccountNote[]>({
    queryKey: ['account_notes', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from('account_notes')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AccountNote[];
    },
    enabled: !!accountId,
  });
}

export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accountId, noteText, authorName, authorUserId }: {
      accountId: string;
      noteText: string;
      authorName: string;
      authorUserId: string;
    }) => {
      const { data, error } = await supabase
        .from('account_notes')
        .insert({
          account_id: accountId,
          note_text: noteText,
          author_name: authorName,
          author_user_id: authorUserId,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AccountNote;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['account_notes', data.account_id] });
      toast.success('Note saved');
    },
    onError: () => {
      toast.error('Failed to save note');
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, noteText, accountId }: {
      noteId: string;
      noteText: string;
      accountId: string;
    }) => {
      const { data, error } = await supabase
        .from('account_notes')
        .update({ note_text: noteText })
        .eq('id', noteId)
        .select()
        .single();
      if (error) throw error;
      return { ...data, account_id: accountId } as AccountNote;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['account_notes', data.account_id] });
      toast.success('Note updated');
    },
    onError: () => {
      toast.error('Failed to update note');
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, accountId }: { noteId: string; accountId: string }) => {
      const { error } = await supabase
        .from('account_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
      return { noteId, accountId };
    },
    onSuccess: ({ accountId }) => {
      queryClient.invalidateQueries({ queryKey: ['account_notes', accountId] });
      toast.success('Note deleted');
    },
    onError: () => {
      toast.error('Failed to delete note');
    },
  });
}
