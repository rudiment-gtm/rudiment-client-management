import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTags } from '@/hooks/useTags';
import { useCustomActivityTypes } from '@/hooks/useTags';
import { useWorkflows, useCreateWorkflow, useUpdateWorkflow, useDeleteWorkflow, useSlackConnection, WorkflowDraft } from '@/hooks/useWorkflows';
import { Slack } from 'lucide-react';
import { statusConfig, AccountStatus } from '@/types/account';
import {
  Workflow,
  TriggerType,
  TRIGGER_LABELS,
  WorkflowStep,
  StepLibraryKey,
  STEP_LIBRARY,
  stepFromLibraryKey,
  describeStep,
  BUILT_IN_ACTIVITY_TYPES,
  MESSAGE_PLACEHOLDERS,
  DEFAULT_ALERT_MESSAGE,
} from '@/types/workflow';
import { cn } from '@/lib/utils';

interface Starter {
  key: string;
  title: string;
  description: string;
  draft: WorkflowDraft;
}

const STARTERS: Starter[] = [
  {
    key: 'win-back',
    title: 'Win back a cancelled account',
    description: 'Account status changes to Win back',
    draft: {
      name: 'Win back a cancelled account',
      trigger_type: 'status_changed',
      trigger_config: { statuses: ['canceled'] },
      conditions: {},
      steps: [
        { type: 'wait', value: 60, unit: 'days' },
        { type: 'alert', channel: 'slack' },
        { type: 'task', title: 'Reach back out' },
      ],
    },
  },
  {
    key: 'follow-up',
    title: 'Follow up after an activity',
    description: 'An activity of a given type is logged',
    draft: {
      name: 'Follow up after an activity',
      trigger_type: 'activity_logged',
      trigger_config: { activityTypes: [] },
      conditions: {},
      steps: [
        { type: 'wait', value: 7, unit: 'days' },
        { type: 'alert', channel: 'email' },
        { type: 'task', title: 'Follow up' },
      ],
    },
  },
  {
    key: 'nurture',
    title: 'Outbound nurturing',
    description: 'Account is tagged for nurture',
    draft: {
      name: 'Outbound nurturing',
      trigger_type: 'tag_added',
      trigger_config: { tagIds: [] },
      conditions: {},
      steps: [
        { type: 'nurture', provider: 'instantly' },
        { type: 'alert', channel: 'email' },
      ],
    },
  },
];

const BLANK_DRAFT: WorkflowDraft = {
  name: 'Untitled workflow',
  trigger_type: 'tag_added',
  trigger_config: {},
  conditions: {},
  steps: [],
};

const WAIT_PRESETS = [7, 30, 60, 90];

function MultiChip({
  options,
  selected,
  onChange,
  labelFor,
  colorFor,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  labelFor: (v: string) => string;
  colorFor?: (v: string) => string | undefined;
}) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.includes(o);
        const color = colorFor?.(o);
        return (
          <button
            key={o}
            onClick={() => toggle(o)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              active ? 'border-transparent' : 'bg-transparent border-border text-muted-foreground hover:text-foreground',
            )}
            style={active ? { backgroundColor: `${color ?? 'hsl(var(--primary))'}20`, color: color ?? 'hsl(var(--primary))' } : undefined}
          >
            {labelFor(o)}
          </button>
        );
      })}
      {options.length === 0 && <p className="text-xs text-muted-foreground">Nothing to choose from yet.</p>}
    </div>
  );
}

function ConditionsCard({ draft, setDraft }: { draft: WorkflowDraft; setDraft: (d: WorkflowDraft) => void }) {
  const { data: tags = [] } = useTags();
  const accounts = useAppStore((s) => s.accounts);
  const { data: customActivityTypes = [] } = useCustomActivityTypes();
  const activityTypes = [...BUILT_IN_ACTIVITY_TYPES, ...customActivityTypes];
  const cities = useMemo(
    () => [...new Set(accounts.map((a) => a.routeCity).filter((c): c is string => !!c))].sort(),
    [accounts],
  );
  const statuses = Object.keys(statusConfig) as AccountStatus[];

  const c = draft.conditions;
  const hasAny = !!(c.tagIds?.length || c.statuses?.length || c.lastActivityTypes?.length || c.cities?.length);

  return (
    <div className="glass-card p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Only run for accounts where</p>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Tag</label>
        <MultiChip
          options={tags.map((t) => t.id)}
          selected={c.tagIds ?? []}
          onChange={(v) => setDraft({ ...draft, conditions: { ...c, tagIds: v } })}
          labelFor={(id) => tags.find((t) => t.id === id)?.label ?? id}
          colorFor={(id) => tags.find((t) => t.id === id)?.color}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Account status</label>
        <MultiChip
          options={statuses}
          selected={c.statuses ?? []}
          onChange={(v) => setDraft({ ...draft, conditions: { ...c, statuses: v } })}
          labelFor={(s) => statusConfig[s as AccountStatus].label}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Last activity type</label>
        <MultiChip
          options={activityTypes}
          selected={c.lastActivityTypes ?? []}
          onChange={(v) => setDraft({ ...draft, conditions: { ...c, lastActivityTypes: v } })}
          labelFor={(v) => v}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">City</label>
        <MultiChip
          options={cities}
          selected={c.cities ?? []}
          onChange={(v) => setDraft({ ...draft, conditions: { ...c, cities: v } })}
          labelFor={(v) => v}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {hasAny ? 'Selections within a field are OR; fields are AND.' : 'No conditions — runs for every account.'}
      </p>
    </div>
  );
}

function TriggerCard({ draft, setDraft, editableType }: { draft: WorkflowDraft; setDraft: (d: WorkflowDraft) => void; editableType: boolean }) {
  const { data: tags = [] } = useTags();
  const { data: customActivityTypes = [] } = useCustomActivityTypes();
  const activityTypes = [...BUILT_IN_ACTIVITY_TYPES, ...customActivityTypes];
  const statuses = Object.keys(statusConfig) as AccountStatus[];

  return (
    <div className="glass-card p-4 space-y-3">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When</label>
      {editableType ? (
        <Select
          value={draft.trigger_type}
          onValueChange={(v) => setDraft({ ...draft, trigger_type: v as TriggerType, trigger_config: {} })}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
              <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm font-medium">{TRIGGER_LABELS[draft.trigger_type]}</p>
      )}

      {draft.trigger_type === 'tag_added' && (
        <div className="space-y-1.5 pt-1">
          <label className="text-xs text-muted-foreground">Matching these tags (empty = any tag)</label>
          <MultiChip
            options={tags.map((t) => t.id)}
            selected={(draft.trigger_config.tagIds as string[]) ?? []}
            onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, tagIds: v } })}
            labelFor={(id) => tags.find((t) => t.id === id)?.label ?? id}
            colorFor={(id) => tags.find((t) => t.id === id)?.color}
          />
        </div>
      )}
      {draft.trigger_type === 'status_changed' && (
        <div className="space-y-1.5 pt-1">
          <label className="text-xs text-muted-foreground">Changes to (empty = any status)</label>
          <MultiChip
            options={statuses}
            selected={(draft.trigger_config.statuses as string[]) ?? []}
            onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, statuses: v } })}
            labelFor={(s) => statusConfig[s as AccountStatus].label}
          />
        </div>
      )}
      {draft.trigger_type === 'activity_logged' && (
        <div className="space-y-1.5 pt-1">
          <label className="text-xs text-muted-foreground">Activity type (empty = any)</label>
          <MultiChip
            options={activityTypes}
            selected={(draft.trigger_config.activityTypes as string[]) ?? []}
            onChange={(v) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, activityTypes: v } })}
            labelFor={(v) => v}
          />
        </div>
      )}
      {draft.trigger_type === 'no_activity_days' && (
        <div className="space-y-1.5 pt-1">
          <label className="text-xs text-muted-foreground">Days of no activity</label>
          <Input
            type="number"
            min={1}
            className="w-24"
            value={(draft.trigger_config.days as number) ?? 90}
            onChange={(e) => setDraft({ ...draft, trigger_config: { ...draft.trigger_config, days: Number(e.target.value) } })}
          />
        </div>
      )}
    </div>
  );
}

type AlertStep = Extract<WorkflowStep, { type: 'alert' }>;

function AlertMessageEditor({ step, onChange }: { step: AlertStep; onChange: (s: AlertStep) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertPlaceholder = (token: string) => {
    const el = textareaRef.current;
    const current = step.message ?? DEFAULT_ALERT_MESSAGE;
    const insertion = `{{${token}}}`;
    if (!el) {
      onChange({ ...step, message: `${current} ${insertion}` });
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + insertion + current.slice(end);
    onChange({ ...step, message: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">Message</label>
      <Textarea
        ref={textareaRef}
        value={step.message ?? DEFAULT_ALERT_MESSAGE}
        onChange={(e) => onChange({ ...step, message: e.target.value })}
        className="min-h-[60px] resize-none text-sm"
        placeholder={DEFAULT_ALERT_MESSAGE}
      />
      <div className="flex flex-wrap gap-1.5">
        {MESSAGE_PLACEHOLDERS.map((p) => (
          <button
            key={p.token}
            type="button"
            onClick={() => insertPlaceholder(p.token)}
            className="px-2 py-0.5 rounded-full text-[11px] border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            + {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SlackConnectionCard({ step, onChange }: { step: AlertStep; onChange: (s: AlertStep) => void }) {
  const { data, isLoading } = useSlackConnection();

  if (isLoading) return <p className="text-xs text-muted-foreground">Checking Slack connection…</p>;

  if (!data?.connected) {
    return (
      <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Connect Slack</p>
          <p className="text-xs text-muted-foreground">Not connected yet — an admin needs to add the Encore Slack app.</p>
        </div>
        <Slack className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Slack className="w-3.5 h-3.5 text-primary" />
        Connected to <span className="font-medium text-foreground">{data.team}</span>
      </div>
      <Select
        value={step.slackChannelId ?? ''}
        onValueChange={(id) => onChange({ ...step, slackChannelId: id, slackChannelName: data.channels.find((c) => c.id === id)?.name })}
      >
        <SelectTrigger className="w-full"><SelectValue placeholder="Choose a channel" /></SelectTrigger>
        <SelectContent>
          {data.channels.map((c) => <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function StepCard({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: WorkflowStep;
  index: number;
  onChange: (s: WorkflowStep) => void;
  onRemove?: () => void;
}) {
  const { data: tags = [] } = useTags();
  const statuses = Object.keys(statusConfig) as AccountStatus[];

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-primary">{index + 1}. {step.type === 'wait' ? 'Wait' : step.type === 'alert' ? 'Alert' : step.type === 'nurture' ? 'Nurture' : step.type === 'task' ? 'Task' : step.type === 'tag' ? 'Tag' : step.type === 'status' ? 'Status' : 'Outbound'}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {step.type === 'wait' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="w-20"
              value={step.value}
              onChange={(e) => onChange({ ...step, value: Number(e.target.value) })}
            />
            {(['hours', 'days', 'weeks'] as const).map((u) => (
              <button
                key={u}
                onClick={() => onChange({ ...step, unit: u })}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  step.unit === u ? 'bg-primary/15 text-primary border-transparent' : 'border-border text-muted-foreground',
                )}
              >
                {u}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {WAIT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => onChange({ ...step, value: p, unit: 'days' })}
                className="px-2 py-0.5 rounded-full text-[11px] border border-border text-muted-foreground hover:text-foreground"
              >
                {p}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Waits {step.value} {step.unit} before the next step.</p>
        </div>
      )}

      {step.type === 'alert' && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {(['slack', 'email', 'both'] as const).map((c) => (
              <button
                key={c}
                onClick={() => onChange({ ...step, channel: c })}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                  step.channel === c ? 'bg-primary/15 text-primary border-transparent' : 'border-border text-muted-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <AlertMessageEditor step={step} onChange={onChange} />
          {(step.channel === 'slack' || step.channel === 'both') && <SlackConnectionCard step={step} onChange={onChange} />}
        </div>
      )}

      {step.type === 'nurture' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onChange({ ...step, provider: 'instantly' })}
            className={cn('rounded-lg border p-2 text-left text-xs', step.provider === 'instantly' ? 'border-primary bg-primary/10' : 'border-border')}
          >
            <p className="font-medium">Send to Instantly.ai</p>
            <p className="text-muted-foreground">Connect your existing workspace</p>
          </button>
          <button
            onClick={() => onChange({ ...step, provider: 'encore' })}
            className={cn('rounded-lg border p-2 text-left text-xs', step.provider === 'encore' ? 'border-primary bg-primary/10' : 'border-border')}
          >
            <p className="font-medium">Use Encore sending</p>
            <p className="text-muted-foreground">Upgrade — sent via our EmailBison inboxes</p>
          </button>
        </div>
      )}

      {step.type === 'task' && (
        <Input
          placeholder="Task title (optional)"
          value={step.title ?? ''}
          onChange={(e) => onChange({ ...step, title: e.target.value })}
        />
      )}

      {step.type === 'tag' && (
        <Select value={step.tagId} onValueChange={(v) => onChange({ ...step, tagId: v })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose a tag" /></SelectTrigger>
          <SelectContent>
            {tags.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {step.type === 'status' && (
        <Select value={step.status} onValueChange={(v) => onChange({ ...step, status: v })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {step.type === 'outbound' && (
        <p className="text-xs text-muted-foreground">Adds the account to an outbound sequence.</p>
      )}
    </div>
  );
}

function WorkflowEditor({
  draft,
  setDraft,
  editableTrigger,
  onSaveDraft,
  onActivate,
  onDelete,
  isExisting,
  saving,
}: {
  draft: WorkflowDraft;
  setDraft: (d: WorkflowDraft) => void;
  editableTrigger: boolean;
  onSaveDraft: () => void;
  onActivate: () => void;
  onDelete?: () => void;
  isExisting: boolean;
  saving: boolean;
}) {
  const addStep = (key: StepLibraryKey) => setDraft({ ...draft, steps: [...draft.steps, stepFromLibraryKey(key)] });
  const updateStep = (i: number, s: WorkflowStep) => setDraft({ ...draft, steps: draft.steps.map((x, idx) => (idx === i ? s : x)) });
  const removeStep = (i: number) => setDraft({ ...draft, steps: draft.steps.filter((_, idx) => idx !== i) });

  const c = draft.conditions;
  const hasConditions = !!(c.tagIds?.length || c.statuses?.length || c.lastActivityTypes?.length || c.cities?.length);
  const [showConditions, setShowConditions] = useState(hasConditions);

  return (
    <div className="space-y-4 max-w-2xl">
      <Input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        className="text-lg font-bold h-auto py-2 border-none bg-transparent px-0 focus-visible:ring-0"
      />

      {showConditions ? (
        <div className="relative">
          <button
            onClick={() => {
              setShowConditions(false);
              setDraft({ ...draft, conditions: {} });
            }}
            className="absolute top-3 right-3 text-muted-foreground hover:text-destructive z-10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <ConditionsCard draft={draft} setDraft={setDraft} />
        </div>
      ) : (
        <button
          onClick={() => setShowConditions(true)}
          className="w-full text-left border border-dashed rounded-lg p-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add condition
        </button>
      )}

      <TriggerCard draft={draft} setDraft={setDraft} editableType={editableTrigger} />

      <div className="space-y-2">
        {draft.steps.map((step, i) => (
          <StepCard key={i} step={step} index={i} onChange={(s) => updateStep(i, s)} onRemove={() => removeStep(i)} />
        ))}
      </div>

      <Select onValueChange={(v) => addStep(v as StepLibraryKey)} value="">
        <SelectTrigger className="w-full border-dashed">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm"><Plus className="w-3.5 h-3.5" /> Add step</span>
        </SelectTrigger>
        <SelectContent>
          {STEP_LIBRARY.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex items-center justify-between pt-2">
        {onDelete ? (
          <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : <div />}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onSaveDraft} disabled={saving}>Save draft</Button>
          <Button onClick={onActivate} disabled={saving}>
            {isExisting ? 'Turn on workflow' : 'Turn on workflow'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsView() {
  const { data: workflows = [] } = useWorkflows();
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<WorkflowDraft>(BLANK_DRAFT);
  const [editableTrigger, setEditableTrigger] = useState(true);
  // Bumped on every selection so the editor remounts (resetting its own
  // local state, e.g. the conditions box) even when switching between two
  // "new" drafts (starter -> starter, or starter -> build-your-own).
  const [selectionNonce, setSelectionNonce] = useState(0);

  const activeCount = workflows.filter((w) => w.status === 'active').length;
  const existing = selectedId && selectedId !== 'new' ? workflows.find((w) => w.id === selectedId) : null;

  const selectStarter = (starter: Starter) => {
    setSelectedId('new');
    setDraft(starter.draft);
    setEditableTrigger(false);
    setSelectionNonce((n) => n + 1);
  };
  const selectBuildYourOwn = () => {
    setSelectedId('new');
    setDraft(BLANK_DRAFT);
    setEditableTrigger(true);
    setSelectionNonce((n) => n + 1);
  };
  const selectExisting = (w: Workflow) => {
    setSelectedId(w.id);
    setDraft({ name: w.name, trigger_type: w.trigger_type, trigger_config: w.trigger_config, conditions: w.conditions, steps: w.steps });
    setEditableTrigger(true);
    setSelectionNonce((n) => n + 1);
  };

  const handleSaveDraft = () => {
    if (existing) updateWorkflow.mutate({ id: existing.id, patch: { ...draft, status: 'draft' } });
    else createWorkflow.mutate({ draft, status: 'draft' }, { onSuccess: (w) => setSelectedId(w.id) });
  };
  const handleActivate = () => {
    if (existing) updateWorkflow.mutate({ id: existing.id, patch: { ...draft, status: 'active' } });
    else createWorkflow.mutate({ draft, status: 'active' }, { onSuccess: (w) => setSelectedId(w.id) });
  };
  const handleDelete = () => {
    if (!existing) return;
    deleteWorkflow.mutate(existing.id);
    setSelectedId(null);
  };

  return (
    <div className="h-full flex bg-background">
      <div className="w-[290px] border-r overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Workflows</h2>
          <span className="text-xs text-muted-foreground">{activeCount} active</span>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Starters</p>
          {STARTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => selectStarter(s)}
              className="w-full text-left glass-card p-3 hover:border-primary/40 transition-colors"
            >
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </button>
          ))}
          <button
            onClick={selectBuildYourOwn}
            className="w-full text-left border border-dashed rounded-lg p-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            + Build your own
          </button>
        </div>

        {workflows.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">My workflows</p>
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => selectExisting(w)}
                className={cn(
                  'w-full text-left rounded-lg p-2.5 transition-colors',
                  selectedId === w.id ? 'bg-primary/10' : 'hover:bg-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{w.name}</p>
                  <Badge variant={w.status === 'active' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                    {w.status}
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
            <p className="text-sm text-muted-foreground">Pick a starter, one of your workflows, or build your own to get going.</p>
          </div>
        ) : (
          <WorkflowEditor
            key={selectionNonce}
            draft={draft}
            setDraft={setDraft}
            editableTrigger={editableTrigger}
            onSaveDraft={handleSaveDraft}
            onActivate={handleActivate}
            onDelete={existing ? handleDelete : undefined}
            isExisting={!!existing}
            saving={createWorkflow.isPending || updateWorkflow.isPending}
          />
        )}
      </div>
    </div>
  );
}
