import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useProjects,
  useCreateProjectSection,
  useCreateProjectItem,
  useUpdateProjectItem,
  useDeleteProjectItem,
  useDeleteProjectSection,
} from '@/hooks/useProjects';
import {
  ProjectItem,
  ProjectSectionWithItems,
  PROJECT_ITEM_STATUSES,
  PROJECT_COMPLETE_STATUSES,
  PERCENT_COMPLETE_OPTIONS,
} from '@/types/project';

// Shared column layout for the master header and every item row so
// everything lines up like a spreadsheet.
const GRID_COLS =
  'grid-cols-[minmax(220px,2.2fr)_132px_130px_150px_120px_120px_112px_132px_minmax(180px,1.6fr)_32px]';

const NAME_COLORS: Record<string, string> = {
  Robert: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Ani: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
  George: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30',
};
const FALLBACK_NAME_PALETTE = [
  'bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30',
  'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30',
  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
];

// Deterministic color per name so the same person always gets the same
// badge color, matching the source spreadsheet's colored name badges.
function nameColorClass(name: string) {
  if (NAME_COLORS[name]) return NAME_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % FALLBACK_NAME_PALETTE.length;
  return FALLBACK_NAME_PALETTE[idx];
}

function percentPillClass(pct: number | null) {
  if (pct === null || pct === undefined) return 'bg-muted text-muted-foreground border-transparent';
  if (pct >= 100) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  if (pct > 0) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  return 'bg-muted text-muted-foreground border-transparent';
}

// Inline text input that shows a colored name badge when it has a value and
// isn't focused — click the badge to edit.
function NameField({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  if (!editing && value) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-left">
        <Badge variant="outline" className={cn('font-medium cursor-text', nameColorClass(value))}>
          {value}
        </Badge>
      </button>
    );
  }

  return (
    <Input
      autoFocus={editing}
      value={draft}
      placeholder="—"
      className="h-8 text-sm"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (draft !== (value ?? '')) onCommit(draft);
      }}
    />
  );
}

function ItemRow({ item }: { item: ProjectItem }) {
  const updateItem = useUpdateProjectItem();
  const deleteItem = useDeleteProjectItem();

  const [description, setDescription] = useState(item.description);
  const [notes, setNotes] = useState(item.notes ?? '');

  useEffect(() => setDescription(item.description), [item.description]);
  useEffect(() => setNotes(item.notes ?? ''), [item.notes]);

  const patch = (fields: Partial<ProjectItem>) => updateItem.mutate({ id: item.id, patch: fields });

  return (
    <div className={cn('grid items-center gap-2 px-4 py-2 border-b group hover:bg-muted/40', GRID_COLS)}>
      <Input
        value={description}
        placeholder="Describe this item…"
        className="h-8 text-sm"
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          if (description !== item.description) patch({ description });
        }}
      />

      <Select value={item.status} onValueChange={(v) => patch({ status: v as ProjectItem['status'] })}>
        <SelectTrigger className="h-8 text-xs border-none p-0 focus:ring-0 [&>svg]:hidden">
          <Badge className="bg-rose-700 hover:bg-rose-700 text-white border-transparent font-bold">
            {item.status}
          </Badge>
        </SelectTrigger>
        <SelectContent>
          {PROJECT_ITEM_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={item.start_date ?? ''}
        className="h-8 text-xs"
        onChange={(e) => patch({ start_date: e.target.value || null })}
      />

      <Input
        type="date"
        value={item.completion_target_date ?? ''}
        className="h-8 text-xs"
        onChange={(e) => patch({ completion_target_date: e.target.value || null })}
      />

      <NameField value={item.assigned_by} onCommit={(v) => patch({ assigned_by: v || null })} />
      <NameField value={item.owner} onCommit={(v) => patch({ owner: v || null })} />

      <Select
        value={item.percent_complete === null || item.percent_complete === undefined ? '__unset' : String(item.percent_complete)}
        onValueChange={(v) => patch({ percent_complete: v === '__unset' ? null : Number(v) })}
      >
        <SelectTrigger className="h-8 text-xs border-none p-0 focus:ring-0 [&>svg]:hidden">
          <Badge variant="outline" className={cn('font-semibold', percentPillClass(item.percent_complete))}>
            {item.percent_complete === null || item.percent_complete === undefined ? '—' : `${item.percent_complete}%`}
          </Badge>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unset">—</SelectItem>
          {PERCENT_COMPLETE_OPTIONS.map((p) => (
            <SelectItem key={p} value={String(p)}>{p}%</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={item.complete_status} onValueChange={(v) => patch({ complete_status: v as ProjectItem['complete_status'] })}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROJECT_COMPLETE_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={notes}
        placeholder="—"
        className="h-8 text-sm"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== (item.notes ?? '')) patch({ notes: notes || null });
        }}
      />

      <button
        type="button"
        onClick={() => deleteItem.mutate(item.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive justify-self-center"
        title="Delete item"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SectionBlock({ section }: { section: ProjectSectionWithItems }) {
  const createItem = useCreateProjectItem();
  const deleteSection = useDeleteProjectSection();

  const addItem = () => {
    const nextPosition = section.items.length
      ? Math.max(...section.items.map((i) => i.position)) + 1
      : 0;
    createItem.mutate({ sectionId: section.id, position: nextPosition });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between bg-[#1d3a5f] text-white px-4 py-2 rounded-t-md">
        <h3 className="text-sm font-bold tracking-wide">{section.name}</h3>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete the "${section.name}" section and all its items?`)) {
              deleteSection.mutate(section.id);
            }
          }}
          className="text-white/60 hover:text-white transition-colors"
          title="Delete section"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="border border-t-0 rounded-b-md overflow-hidden">
        {section.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
        <button
          type="button"
          onClick={addItem}
          className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add item
        </button>
      </div>
    </div>
  );
}

export default function ProjectsView() {
  const { data: sections = [], isLoading } = useProjects();
  const createSection = useCreateProjectSection();

  const addSection = () => {
    const name = window.prompt('New section name');
    if (!name || !name.trim()) return;
    const nextPosition = sections.length ? Math.max(...sections.map((s) => s.position)) + 1 : 0;
    createSection.mutate({ name: name.trim(), position: nextPosition });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 pt-6 pb-3 border-b">
        <div>
          <h2 className="text-lg font-bold">Projects</h2>
          <p className="text-xs text-muted-foreground">Team project tracker</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={addSection}>
          <Plus className="w-4 h-4" />
          Add section
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="min-w-[1100px]">
            <div className={cn('grid gap-2 px-4 py-2 bg-muted rounded-t-md text-xs font-semibold text-muted-foreground uppercase tracking-wide', GRID_COLS)}>
              <span>Description</span>
              <span>Status</span>
              <span>Start Date</span>
              <span>Completion Target</span>
              <span>Assigned By</span>
              <span>Owner</span>
              <span>% Complete</span>
              <span>Complete Status</span>
              <span>Notes</span>
              <span />
            </div>

            <div className="mt-2">
              {sections.map((section) => (
                <SectionBlock key={section.id} section={section} />
              ))}
              {sections.length === 0 && (
                <p className="text-sm text-muted-foreground italic py-6 text-center">No sections yet — add one to get started.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
