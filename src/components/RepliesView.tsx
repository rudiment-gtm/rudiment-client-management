import { useState } from 'react';
import { Loader2, Search, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useEmailReplies, useEmailReply, useSendReply, type ReplyFolder, type ReplyStatus } from '@/hooks/useEmailReplies';

const FOLDERS: { value: ReplyFolder; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'sent', label: 'Sent' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'spam', label: 'Spam' },
  { value: 'all', label: 'All' },
];

const STATUSES: { value: ReplyStatus; label: string }[] = [
  { value: 'real', label: 'Real replies' },
  { value: 'interested', label: 'Interested' },
  { value: 'automated', label: 'Automated' },
  { value: 'all', label: 'All' },
];

function ThreadPanel({ replyId }: { replyId: number }) {
  const { data, isLoading } = useEmailReply(replyId);
  const sendReply = useSendReply();
  const [message, setMessage] = useState('');

  const reply = data?.data;

  const handleSend = async () => {
    if (!message.trim()) return;
    try {
      await sendReply.mutateAsync({ replyId, message });
      setMessage('');
      toast.success('Reply sent — synced to EmailBison');
    } catch (e) {
      toast.error(`Could not send: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!reply) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Couldn't load this conversation.</div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b space-y-1">
        <p className="font-semibold text-sm">{reply.subject || '(no subject)'}</p>
        <p className="text-xs text-muted-foreground">
          {reply.lead ? `${reply.lead.first_name} ${reply.lead.last_name ?? ''} · ${reply.lead.company ?? ''}` : reply.from_email_address}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {reply.html_body ? (
          <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: reply.html_body }} />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{reply.text_body}</p>
        )}
      </div>
      <div className="p-4 border-t space-y-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Reply — sends from EmailBison and syncs back into this thread"
          className="min-h-[90px] text-sm"
        />
        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={sendReply.isPending || !message.trim()} className="gap-2">
            {sendReply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RepliesView() {
  const [folder, setFolder] = useState<ReplyFolder>('inbox');
  const [status, setStatus] = useState<ReplyStatus>('real');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useEmailReplies(folder, status, search || undefined);
  const replies = data?.data ?? [];

  return (
    <div className="h-full flex bg-background">
      <div className="w-[340px] border-r overflow-y-auto flex flex-col">
        <div className="p-4 space-y-3 border-b">
          <h2 className="font-bold">Replies</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search replies…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FOLDERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFolder(f.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  folder === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1 border-t">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={cn(
                  'mt-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  status === s.value ? 'bg-secondary text-secondary-foreground ring-1 ring-primary/40' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : replies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10 px-4">
              No matches in {folder}
              {data && !data.scannedAllAvailable && ' (checked the most recent messages — there may be more further back)'}.
            </p>
          ) : (
            replies.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'w-full text-left p-3 border-b hover:bg-muted transition-colors',
                  selectedId === r.id && 'bg-primary/10',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('text-sm truncate', !r.read && 'font-semibold')}>
                    {r.lead ? `${r.lead.first_name} ${r.lead.last_name ?? ''}` : r.from_name || r.from_email_address || 'Unknown'}
                  </p>
                  {r.interested && <Badge className="text-[10px] shrink-0 bg-status-active text-white">interested</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{r.subject || '(no subject)'}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {selectedId === null ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Pick a reply to read the thread.</div>
      ) : (
        <ThreadPanel key={selectedId} replyId={selectedId} />
      )}
    </div>
  );
}
