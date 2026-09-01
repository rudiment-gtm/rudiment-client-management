import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Member {
  user_id: string;
  email: string;
  display_name: string | null;
  role: 'admin' | 'rep';
  status: 'active' | 'invited';
  created_at: string;
}

// Every teammate on the shared Encore login — sourced from the list_members()
// SECURITY DEFINER function (a plain client query can't join auth.users).
export function useMembers() {
  return useQuery<Member[]>({
    queryKey: ['members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_members');
      if (error) throw error;
      return data as Member[];
    },
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: 'admin' | 'rep' }) => {
      const { data, error } = await supabase.functions.invoke('invite-member', {
        body: { email, role, redirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Invite sent');
    },
    onError: (err) => {
      toast.error(`Failed to invite: ${err instanceof Error ? err.message : 'unknown error'}`);
    },
  });
}
