import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, Workflow, GitBranch, Route as RouteIcon, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/AuthProvider';
import { useAppStore } from '@/store/appStore';
import { useCreateWorkflow } from '@/hooks/useWorkflows';
import type { WorkflowDraft } from '@/hooks/useWorkflows';
import type { TriggerType, TriggerConfig, WorkflowStep } from '@/types/workflow';
import { useCreateSequence } from '@/hooks/useEmailSequences';
import type { SequenceDraft } from '@/hooks/useEmailSequences';
import type { SequenceStep } from '@/types/emailSequence';
import { toast } from 'sonner';

// Compact "TRIGGER → WAIT → THEN" flow-box rendering for the workflow draft
// card — mirrors the terminal-style boxes in the marketing site's Cue demo,
// distinct from the fuller labels used elsewhere (workflow.ts's
// TRIGGER_LABELS/describeStep are for the full Workflows tab editor).
function triggerBox(type: TriggerType, config: TriggerConfig): { label: string; value: string } {
  switch (type) {
    case 'status_changed':
      return { label: 'TRIGGER', value: config.statuses?.length ? `Status → ${config.statuses.join(', ')}` : 'Status changes' };
    case 'tag_added':
      return { label: 'TRIGGER', value: 'Tag added' };
    case 'activity_logged':
      return { label: 'TRIGGER', value: config.activityTypes?.length ? `Activity → ${config.activityTypes.join(', ')}` : 'Activity logged' };
    case 'no_activity_days':
      return { label: 'TRIGGER', value: config.days ? `No activity ${config.days}d` : 'No activity' };
    case 'follow_up_due':
      return { label: 'TRIGGER', value: 'Follow-up due' };
    case 'account_imported':
      return { label: 'TRIGGER', value: 'Account imported' };
  }
}

function stepBox(step: WorkflowStep): { label: string; value: string } {
  switch (step.type) {
    case 'wait':
      return { label: 'WAIT', value: `${step.value} ${step.unit}` };
    case 'alert':
      return { label: 'ALERT', value: `Notify via ${step.channel}` };
    case 'nurture':
      return { label: 'NURTURE', value: `Start ${step.provider} sequence` };
    case 'task':
      return { label: 'THEN', value: step.title || 'Create task' };
    case 'tag':
      return { label: 'THEN', value: 'Add tag' };
    case 'status':
      return { label: 'THEN', value: `Set status → ${step.status}` };
    case 'outbound':
      return { label: 'THEN', value: 'Add to outbound sequence' };
  }
}

function FlowBoxRow({ boxes }: { boxes: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {boxes.map((box, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2 min-w-[110px]">
            <div className="font-mono text-[10px] tracking-wider text-muted-foreground">{box.label}</div>
            <div className="text-sm">{box.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowFlowBoxes({ draft }: { draft: WorkflowDraft }) {
  return <FlowBoxRow boxes={[triggerBox(draft.trigger_type, draft.trigger_config), ...draft.steps.map(stepBox)]} />;
}

function SequenceFlowBoxes({ steps }: { steps: SequenceStep[] }) {
  const boxes = steps.flatMap((step, i) => {
    const emailBox = { label: `EMAIL ${i + 1}`, value: step.subject || '(no subject)' };
    if (i === 0) return [emailBox];
    return [{ label: 'WAIT', value: `${step.waitDays} day${step.waitDays === 1 ? '' : 's'}` }, emailBox];
  });
  return <FlowBoxRow boxes={boxes} />;
}

interface ChatTableRow {
  name: string;
  city: string;
  status: string;
  services: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  rows?: ChatTableRow[];
  columns?: string[];
  count?: number;
  workflowDraft?: { summary: string; draft: WorkflowDraft };
  sequenceDraft?: { summary: string; draft: SequenceDraft };
  routeDraft?: { summary: string; accountIds: string[] };
  draftSaved?: boolean;
}

type BuildMode = 'none' | 'workflow' | 'sequence' | 'route';

const SUGGESTIONS = [
  'Summarize churn risk across canceled accounts',
  'Which accounts are Full Service?',
  'List accounts with no visit logged yet',
];

const BUILD_OPTIONS: { mode: BuildMode; label: string; icon: typeof Workflow; wired: boolean; kickoff: string }[] = [
  {
    mode: 'workflow', label: 'Workflow', icon: Workflow, wired: true,
    kickoff: "Happy to help you build a workflow — I'll ask a few quick questions, then you can review everything before it saves.",
  },
  {
    mode: 'sequence', label: 'Sequence', icon: GitBranch, wired: true,
    kickoff: "Let's put a sequence together — I'll ask about the audience and the angle, then you review the actual copy before anything sends.",
  },
  {
    mode: 'route', label: 'Route', icon: RouteIcon, wired: true,
    kickoff: "Let's build you a route — a couple quick questions about who you want to visit, then you can tweak it before heading out.",
  },
];

function firstNameFrom(displayName: string | null | undefined, email: string | null | undefined): string {
  if (displayName?.trim()) return displayName.trim().split(/\s+/)[0];
  if (email) return email.split('@')[0];
  return 'there';
}

export default function ChatView() {
  const { profile, user } = useAuthContext();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const accounts = useAppStore((s) => s.accounts);
  const routeStops = useAppStore((s) => s.routeStops);
  const isRouteModeActive = useAppStore((s) => s.isRouteModeActive);
  const toggleRouteMode = useAppStore((s) => s.toggleRouteMode);
  const loadRouteFromSnapshot = useAppStore((s) => s.loadRouteFromSnapshot);
  const createWorkflow = useCreateWorkflow();
  const createSequence = useCreateSequence();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [mode, setMode] = useState<BuildMode>('none');
  const [savingRoute, setSavingRoute] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  // apiHistory, when passed explicitly (even as []), means the user-facing
  // message has already been pushed to `messages` by the caller (e.g.
  // startBuild, which also inserts a static kickoff line in between) — so
  // this skips re-adding it and just uses apiHistory + the new text as
  // what's actually sent to the model. Every reply is appended via a
  // functional update so it can never clobber messages added just before
  // calling this (the earlier bug: startBuild's kickoff line was getting
  // overwritten because both calls used setMessages(fullArray) directly).
  const send = async (raw: string, sendMode: BuildMode = mode, apiHistory?: ChatMessage[]) => {
    const text = raw.trim();
    if (!text || thinking) return;
    const userMsg = { role: 'user' as const, text };
    const historyForApi = [...(apiHistory ?? messages), userMsg];
    if (!apiHistory) setMessages((m) => [...m, userMsg]);
    setInput('');
    setThinking(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: historyForApi.map((m) => ({ role: m.role, content: m.text })),
          ...(sendMode !== 'none' ? { mode: sendMode } : {}),
          ...(sendMode === 'route' ? { currentRouteStopCount: routeStops.length } : {}),
        },
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
      if (data?.type === 'workflow_draft') {
        setMessages((m) => [...m, {
          role: 'assistant',
          text: data.summary,
          workflowDraft: { summary: data.summary, draft: data.draft },
        }]);
        return;
      }
      if (data?.type === 'sequence_draft') {
        setMessages((m) => [...m, {
          role: 'assistant',
          text: data.summary,
          sequenceDraft: { summary: data.summary, draft: data.draft },
        }]);
        return;
      }
      if (data?.type === 'route_draft') {
        setMessages((m) => [...m, {
          role: 'assistant',
          text: data.summary,
          routeDraft: { summary: data.summary, accountIds: data.accountIds },
        }]);
        return;
      }
      setMessages((m) => [...m, {
        role: 'assistant',
        text: data?.text || 'No response.',
        rows: data?.rows,
        columns: data?.columns,
        count: data?.count,
      }]);
    } catch (e) {
      setThinking(false);
      setMessages((m) => [...m, { role: 'assistant', text: 'Could not reach Cue. Please try again.' }]);
    }
  };

  const startBuild = (option: typeof BUILD_OPTIONS[number]) => {
    if (!option.wired) {
      setMessages([{
        role: 'assistant',
        text: `Building a ${option.label.toLowerCase()} from Cue isn't wired up yet — for now, create one from its own tab. Ask me anything else about your accounts in the meantime.`,
      }]);
      return;
    }
    setMode(option.mode);
    const userText = `Let's build a ${option.label.toLowerCase()}.`;
    // The opening framing is rendered here directly rather than left to the
    // model — asking it to originate the warmth on the same turn as a
    // structured chip reply proved unreliable across several prompt
    // rewrites. This guarantees it every time. It's shown, but NOT sent to
    // the model as conversation history (apiHistory: [] below) — the real
    // first question still comes from a fresh, normal API call.
    setMessages([{ role: 'user', text: userText }, { role: 'assistant', text: option.kickoff }]);
    send(userText, option.mode, []);
  };

  const saveWorkflowDraft = async (msgIndex: number, draft: WorkflowDraft) => {
    try {
      await createWorkflow.mutateAsync({ draft, status: 'draft' });
      setMessages((m) => m.map((msg, i) => (i === msgIndex ? { ...msg, draftSaved: true } : msg)));
      toast.success('Saved as a draft — opening it in Workflows.');
      setActiveTab('workflows');
    } catch (e) {
      toast.error(`Could not save: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const saveSequenceDraft = async (msgIndex: number, draft: SequenceDraft) => {
    try {
      await createSequence.mutateAsync(draft);
      setMessages((m) => m.map((msg, i) => (i === msgIndex ? { ...msg, draftSaved: true } : msg)));
      toast.success('Saved as a draft — opening it in Sequences.');
      setActiveTab('sequences');
    } catch (e) {
      toast.error(`Could not save: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const buildRoute = async (msgIndex: number, accountIds: string[]) => {
    setSavingRoute(true);
    try {
      const stops = accountIds
        .filter((id) => accounts.some((a) => a.id === id))
        .map((id) => ({ kind: 'account' as const, id }));
      if (!stops.length) {
        toast.error('None of those accounts are currently loaded — try again.');
        return;
      }
      if (!isRouteModeActive) toggleRouteMode();
      loadRouteFromSnapshot(stops);
      setMessages((m) => m.map((msg, i) => (i === msgIndex ? { ...msg, draftSaved: true } : msg)));
      toast.success(`Route built — ${stops.length} stop${stops.length === 1 ? '' : 's'}. Opening the map.`);
      setActiveTab('map');
    } finally {
      setSavingRoute(false);
    }
  };

  const firstName = firstNameFrom(profile?.display_name, user?.email);
  const showEntryScreen = messages.length === 0 && mode === 'none';

  return (
    <div className="h-full flex flex-col bg-background">
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          {notConfigured && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Cue isn't connected yet — add an ANTHROPIC_API_KEY secret to enable real answers.</span>
            </div>
          )}

          {showEntryScreen && (
            <div className="text-center py-16 space-y-6">
              <div className="space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-primary" />
                <h2 className="text-xl font-semibold">Hi {firstName}, what do you want to build today?</h2>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                {BUILD_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.mode}
                      onClick={() => startBuild(opt)}
                      className="glass-card w-32 h-28 flex flex-col items-center justify-center gap-2 hover:border-primary/40 transition-colors"
                    >
                      <Icon className="w-6 h-6 text-primary" />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 pt-4">
                <p className="text-sm text-muted-foreground">Or just ask about your accounts</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s, 'none')}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
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

              {!!m.rows?.length && (
                <div className="mt-2 w-full border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-[28%]" />
                      <col className="w-[18%]" />
                      <col className="w-[14%]" />
                      <col className="w-[40%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-muted/70 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        {(m.columns || ['Name', 'City', 'Status', 'Services']).map((col) => (
                          <th key={col} className="text-left px-3 py-2 font-medium">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.rows.map((row, ri) => (
                        <tr key={ri} className="border-t border-border">
                          <td className="px-3 py-2 break-words">{row.name}</td>
                          <td className="px-3 py-2 text-muted-foreground break-words">{row.city}</td>
                          <td className="px-3 py-2 text-muted-foreground break-words">{row.status}</td>
                          <td className="px-3 py-2 text-muted-foreground break-words">{row.services}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {typeof m.count === 'number' && m.count > m.rows.length && (
                    <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/40 border-t border-border">
                      Showing {m.rows.length} of {m.count} total
                    </div>
                  )}
                </div>
              )}

              {m.workflowDraft && (
                <div className="mt-2 w-full glass-card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Workflow className="w-3.5 h-3.5" />
                    {m.workflowDraft.draft.name}
                  </div>
                  <WorkflowFlowBoxes draft={m.workflowDraft.draft} />
                  {m.draftSaved ? (
                    <p className="text-xs text-status-active font-medium">Saved — open it in the Workflows tab.</p>
                  ) : (
                    <button
                      onClick={() => saveWorkflowDraft(i, m.workflowDraft!.draft)}
                      disabled={createWorkflow.isPending}
                      className="btn-pill-primary text-xs px-3 py-1.5"
                    >
                      {createWorkflow.isPending ? 'Saving…' : 'Save as draft'}
                    </button>
                  )}
                </div>
              )}

              {m.sequenceDraft && (
                <div className="mt-2 w-full glass-card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <GitBranch className="w-3.5 h-3.5" />
                    {m.sequenceDraft.draft.name}
                  </div>
                  <SequenceFlowBoxes steps={m.sequenceDraft.draft.steps} />
                  {m.draftSaved ? (
                    <p className="text-xs text-status-active font-medium">Saved — open it in the Sequences tab.</p>
                  ) : (
                    <button
                      onClick={() => saveSequenceDraft(i, m.sequenceDraft!.draft)}
                      disabled={createSequence.isPending}
                      className="btn-pill-primary text-xs px-3 py-1.5"
                    >
                      {createSequence.isPending ? 'Saving…' : 'Save as draft'}
                    </button>
                  )}
                </div>
              )}

              {m.routeDraft && (
                <div className="mt-2 w-full glass-card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <RouteIcon className="w-3.5 h-3.5" />
                    Route draft
                  </div>
                  <p className="text-xs text-muted-foreground">{m.routeDraft.accountIds.length} stop{m.routeDraft.accountIds.length === 1 ? '' : 's'}</p>
                  {m.draftSaved ? (
                    <p className="text-xs text-status-active font-medium">Built — open the map to review or start navigation.</p>
                  ) : (
                    <button
                      onClick={() => buildRoute(i, m.routeDraft!.accountIds)}
                      disabled={savingRoute}
                      className="btn-pill-primary text-xs px-3 py-1.5"
                    >
                      {savingRoute ? 'Building…' : 'Build this route'}
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
            placeholder={mode !== 'none' ? 'Answer Cue’s questions…' : 'Ask Cue anything…'}
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
