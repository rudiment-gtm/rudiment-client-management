import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EmailReply } from '@/types/emailReply';

export type ReplyFolder = 'inbox' | 'sent' | 'spam' | 'bounced' | 'all';
// EmailBison's own status/tracked_reply query params turned out not to
// reliably filter server-side (verified empirically) — the edge function
// filters client-side using the real booleans on each reply instead:
// 'real' = tracked_reply (an actual lead conversation, not DMARC/report
// noise), 'interested' = manually/AI-marked, 'automated' = auto-detected
// auto-responder, 'all' = no filter.
export type ReplyStatus = 'all' | 'interested' | 'real' | 'automated';

interface ReplyListResponse {
  data: EmailReply[];
  scannedAllAvailable: boolean;
}

export function useEmailReplies(folder: ReplyFolder = 'inbox', status: ReplyStatus = 'real', search?: string) {
  return useQuery<ReplyListResponse>({
    queryKey: ['emailbison_replies', folder, status, search ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('emailbison-replies', {
        body: { folder, status, search: search || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ReplyListResponse;
    },
    refetchInterval: 60_000, // matches the same poll cadence as the workspace dashboard
  });
}

export function useEmailReply(replyId: number | null) {
  return useQuery<{ data: EmailReply }>({
    queryKey: ['emailbison_reply', replyId],
    enabled: replyId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('emailbison-replies', {
        body: { replyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { data: EmailReply };
    },
  });
}

export function useSendReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ replyId, message }: { replyId: number; message: string }) => {
      const { data, error } = await supabase.functions.invoke('emailbison-send-reply', {
        body: { replyId, message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailbison_replies'] });
      queryClient.invalidateQueries({ queryKey: ['emailbison_reply'] });
    },
  });
}
