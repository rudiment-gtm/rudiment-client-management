import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Trash2, Send, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useFilterScope } from '@/components/filters/useFilterScope';
import AdvancedFilterPanel from '@/components/filters/AdvancedFilterPanel';
import { evaluateFilters } from '@/lib/filterEvaluator';
import {
  useEmailSequences,
  useCreateSequence,
  useUpdateSequenceDraft,
  useDeleteSequence,
  useSaveSequenceToEmailBison,
  useEmailBisonPushLeads,
  accountToLead,
  type SequenceDraft,
} from '@/hooks/useEmailSequences';
import { EmailSequence, SequenceStep, BLANK_STEP } from '@/types/emailSequence';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const BLANK_DRAFT: SequenceDraft = { name: 'Untitled sequence', filter_groups: [], steps: [{ ...BLANK_STEP }] };

function StepCard({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: SequenceStep;
  index: number;
  onChange: (s: SequenceStep) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-primary">Step {index + 1}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <Input
        value={step.subject}
        onChange={(e) => onChange({ ...step, subject: e.target.value })}
        placeholder="Email subject"
      />
      <Textarea
        value={step.body}
        onChange={(e) => onChange({ ...step, body: e.target.value })}
        placeholder="Email body — {{first_name}}, {{company}} etc. are filled in per recipient"
        className="min-h-[100px] text-sm"
      />
      {index > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Wait</span>
          <Input
            type="number"
            min={0}
            value={step.waitDays}
            onChange={(e) => onChange({ ...step, waitDays: Number(e.target.value) })}
            className="w-16 h-7 text-xs"
          />
          <span>day{step.waitDays === 1 ? '' : 's'} after the previous step</span>
        </div>
      )}
    </div>
  );
}

function SequenceEditor({
  draft,
  setDraft,
  onSaveDraft,
  onPublish,
  onPush,
  onDelete,
  isExisting,
  isPublished,
  matchCount,
  pushableCount,
  lastPushed,
  saving,
  publishing,
  pushing,
}: {
  draft: SequenceDraft;
  setDraft: (d: SequenceDraft) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPush: () => void;
  onDelete?: () => void;
  isExisting: boolean;
  isPublished: boolean;
  matchCount: number;
  pushableCount: number;
  lastPushed: { count: number; at: string } | null;
  saving: boolean;
  publishing: boolean;
  pushing: boolean;
}) {
  const { filters } = useFilterScope('sequence');
  const addStep = () => setDraft({ ...draft, steps: [...draft.steps, { ...BLANK_STEP }] });
  const updateStep = (i: number, s: SequenceStep) => setDraft({ ...draft, steps: draft.steps.map((x, idx) => (idx === i ? s : x)) });
  const removeStep = (i: number) => setDraft({ ...draft, steps: draft.steps.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4 max-w-2xl">
      <Input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        className="text-lg font-bold h-auto py-2 border-none bg-transparent px-0 focus-visible:ring-0"
      />

      <div className="glass-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience</p>
        <AdvancedFilterPanel scope="sequence" />
        <p className="text-xs text-muted-foreground">
          {matchCount} account{matchCount === 1 ? '' : 's'} match — {pushableCount} of those have an email on file and can actually be pushed.
        </p>
      </div>

      <div className="space-y-2">
        {draft.steps.map((step, i) => (
          <StepCard key={i} step={step} index={i} onChange={(s) => updateStep(i, s)} onRemove={draft.steps.length > 1 ? () => removeStep(i) : undefined} />
        ))}
      </div>

      <button
        onClick={addStep}
        className="w-full text-left border border-dashed rounded-lg p-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors inline-flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" /> Add step
      </button>

      {isPublished && (
        <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
          <p>Live in EmailBison — Save now updates the existing sequence content in place.</p>
          {lastPushed && (
            <p>Last pushed {lastPushed.count} lead{lastPushed.count === 1 ? '' : 's'} on {new Date(lastPushed.at).toLocaleDateString()}.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        {onDelete ? (
          <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : <div />}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onSaveDraft} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save draft'}
          </Button>
          <Button onClick={onPublish} disabled={publishing}>
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : isPublished ? 'Update sequence' : 'Save & activate'}
          </Button>
          {isExisting && isPublished && (
            <Button onClick={onPush} disabled={pushing || pushableCount === 0} className="gap-2 bg-status-active hover:bg-status-active/90 text-white">
              {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Push {pushableCount} lead{pushableCount === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SequencesView() {
  const { data: sequences = [] } = useEmailSequences();
  const accounts = useAppStore((s) => s.accounts);
  const setSequenceFilters = useAppStore((s) => s.setSequenceAdvancedFilters);
  const { filters: sequenceFilters } = useFilterScope('sequence');

  const createSequence = useCreateSequence();
  const updateDraft = useUpdateSequenceDraft();
  const deleteSequence = useDeleteSequence();
  const saveToEmailBison = useSaveSequenceToEmailBison();
  const pushLeads = useEmailBisonPushLeads();

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<SequenceDraft>(BLANK_DRAFT);
  const [selectionNonce, setSelectionNonce] = useState(0);

  const existing = selectedId && selectedId !== 'new' ? sequences.find((s) => s.id === selectedId) : null;

  const selectNew = () => {
    setSelectedId('new');
    setDraft(BLANK_DRAFT);
    setSequenceFilters([]);
    setSelectionNonce((n) => n + 1);
  };
  const selectExisting = (seq: EmailSequence) => {
    setSelectedId(seq.id);
    setDraft({ name: seq.name, filter_groups: seq.filter_groups, steps: seq.steps.length ? seq.steps : [{ ...BLANK_STEP }] });
    setSequenceFilters(seq.filter_groups);
    setSelectionNonce((n) => n + 1);
  };

  const matchingAccounts = useMemo(
    () => accounts.filter((a) => evaluateFilters(a, sequenceFilters)),
    [accounts, sequenceFilters],
  );
  const pushableLeads = useMemo(
    () => matchingAccounts.map(accountToLead).filter((l): l is NonNullable<typeof l> => l !== null),
    [matchingAccounts],
  );

  // Persists name/steps/filters to our own row — returns the row id so
  // callers (Save & activate) can immediately act on it without waiting for
  // a re-render.
  const saveDraft = async (): Promise<string> => {
    const patch = { name: draft.name, steps: draft.steps, filter_groups: sequenceFilters };
    if (existing) {
      await updateDraft.mutateAsync({ id: existing.id, patch });
      return existing.id;
    }
    const created = await createSequence.mutateAsync(patch);
    setSelectedId(created.id);
    return created.id;
  };

  const handleSaveDraft = async () => {
    try {
      await saveDraft();
      toast.success('Draft saved');
    } catch (e) {
      toast.error(`Could not save: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const handlePublish = async () => {
    try {
      const id = await saveDraft();
      await saveToEmailBison.mutateAsync(id);
      toast.success('Sequence is live in EmailBison');
    } catch (e) {
      toast.error(`Could not activate: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const handlePush = async () => {
    if (!existing) return;
    try {
      const result = await pushLeads.mutateAsync({ sequenceId: existing.id, leads: pushableLeads });
      toast.success(`Pushed ${result.pushed} lead${result.pushed === 1 ? '' : 's'} to EmailBison`);
    } catch (e) {
      toast.error(`Could not push leads: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    deleteSequence.mutate(existing.id);
    setSelectedId(null);
  };

  return (
    <div className="h-full flex bg-background">
      <div className="w-[290px] border-r overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Sequences</h2>
        </div>

        <button
          onClick={selectNew}
          className="w-full text-left border border-dashed rounded-lg p-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          + New sequence
        </button>

        {sequences.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">Saved</p>
            {sequences.map((seq) => (
              <button
                key={seq.id}
                onClick={() => selectExisting(seq)}
                className={cn(
                  'w-full text-left rounded-lg p-2.5 transition-colors',
                  selectedId === seq.id ? 'bg-primary/10' : 'hover:bg-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{seq.name}</p>
                  <Badge variant={seq.emailbison_campaign_id ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                    {seq.emailbison_campaign_id ? 'live' : 'draft'}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {selectedId === null ? (
          <div className="max-w-md mx-auto mt-16 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Pick a saved sequence, or start a new one.</p>
          </div>
        ) : (
          <SequenceEditor
            key={selectionNonce}
            draft={draft}
            setDraft={setDraft}
            onSaveDraft={handleSaveDraft}
            onPublish={handlePublish}
            onPush={handlePush}
            onDelete={existing ? handleDelete : undefined}
            isExisting={!!existing}
            isPublished={!!existing?.emailbison_campaign_id}
            matchCount={matchingAccounts.length}
            pushableCount={pushableLeads.length}
            lastPushed={existing?.last_pushed_at ? { count: existing.last_pushed_lead_count ?? 0, at: existing.last_pushed_at } : null}
            saving={createSequence.isPending || updateDraft.isPending}
            publishing={saveToEmailBison.isPending}
            pushing={pushLeads.isPending}
          />
        )}
      </div>
    </div>
  );
}
