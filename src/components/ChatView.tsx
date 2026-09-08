import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/AuthProvider';
import { toast } from 'sonner';

interface RequestDraft {
  summary: string;
  message: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  columns?: string[];
  rows?: string[][];
  requestDraft?: RequestDraft;
  draftSaved?: boolean;
}

const SUGGESTIONS = [
  'How are my campaigns performing right now?',
  'What subject line or angle is performing best?',
  'I need the team to fix something',
];

function firstNameFrom(displayName: string | null | undefined, email: string | null | undefined): string {
  if (displayName?.trim()) return displayName.trim().split(/\s+/)[0];
  if (email) return email.split('@')[0];
  return 'there';
}

export default function ChatView() {
  const { profile, user } = useAuthContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [sendingRequestAt, setSendingRequestAt] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    const userMsg = { role: 'user' as const, text };
    const historyForApi = [...messages, userMsg];
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setThinking(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: historyForApi.map((m) => ({ role: m.role, content: m.text })) },
      });
      setThinking(false);
      if (error) {
        setMessages((m) => [...m, { role: 'assistant', text: `Request failed: ${error.message}` }]);
        return;
      }
      if (data?.notConfigured) {
        setNotConfigured(true);
        return;
      }
      if (data?.type === 'request_draft') {
        setMessages((m) => [...m, {
          role: 'assistant',
          text: data.summary,
          requestDraft: { summary: data.summary, message: data.message },
        }]);
        return;
      }
      setMessages((m) => [...m, {
        role: 'assistant',
        text: data?.text || 'No response.',
        columns: data?.columns,
        rows: data?.rows,
      }]);
    } catch (e) {
      setThinking(false);
      setMessages((m) => [...m, { role: 'assistant', text: 'Could not reach Rudi. Please try again.' }]);
    }
  };

  const sendToTeam = async (msgIndex: number, draft: RequestDraft) => {
    setSendingRequestAt(msgIndex);
    try {
      const { data, error } = await supabase.functions.invoke('notify-team', {
        body: { message: draft.message },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setMessages((m) => m.map((msg, i) => (i === msgIndex ? { ...msg, draftSaved: true } : msg)));
      toast.success('Sent to the team.');
    } catch (e) {
      toast.error(`Could not send: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSendingRequestAt(null);
    }
  };

  const firstName = firstNameFrom(profile?.display_name, user?.email);
  const showEntryScreen = messages.length === 0;

  return (
    <div className="h-full flex flex-col bg-background">
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          {notConfigured && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Rudi isn't connected yet — add an ANTHROPIC_API_KEY secret to enable real answers.</span>
            </div>
          )}

          {showEntryScreen && (
            <div className="text-center py-16 space-y-6">
              <div className="space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-primary" />
                <h2 className="text-xl font-semibold">Hi {firstName}, what can I help you with?</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Ask about how your campaigns are performing, or flag something you need the team to look at.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                )}
              >
                {m.text}
              </div>

              {!!m.rows?.length && !!m.columns?.length && (
                <div className="mt-2 w-full border border-border rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/70 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        {m.columns.map((col) => (
                          <th key={col} className="text-left px-3 py-2 font-medium whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.rows.map((row, ri) => (
                        <tr key={ri} className="border-t border-border">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 break-words text-muted-foreground first:text-foreground">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {m.requestDraft && (
                <div className="mt-2 w-full glass-card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <MessageSquareWarning className="w-3.5 h-3.5" />
                    Flag for the team
                  </div>
                  <p className="text-sm rounded-lg border border-border bg-background/60 px-3 py-2">{m.requestDraft.message}</p>
                  {m.draftSaved ? (
                    <p className="text-xs text-status-active font-medium">Sent to the team.</p>
                  ) : (
                    <button
                      onClick={() => sendToTeam(i, m.requestDraft!)}
                      disabled={sendingRequestAt === i}
                      className="btn-pill-primary text-xs px-3 py-1.5"
                    >
                      {sendingRequestAt === i ? 'Sending…' : 'Send to team'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {thinking && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-xl px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Rudi anything…"
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button size="icon" className="h-11 w-11 flex-shrink-0" disabled={thinking || !input.trim()} onClick={() => send(input)}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
