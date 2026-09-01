import { useState, KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

import { Badge } from '@/components/ui/badge';
import { ChevronDown, X } from 'lucide-react';
import {
  FilterField,
  FilterOperator,
  FilterValue,
  FIELD_META,
} from '@/types/filters';
import { AccountStatus, ServiceType, statusConfig, serviceConfig, ALL_SERVICE_TYPES } from '@/types/account';
import { useTags } from '@/hooks/useTags';
import { cn } from '@/lib/utils';

interface Props {
  field: FilterField;
  operator: FilterOperator;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}

const STATUS_OPTIONS: AccountStatus[] = Object.keys(statusConfig) as AccountStatus[];
const SERVICE_OPTIONS: ServiceType[] = ALL_SERVICE_TYPES;

function MultiSelect<T extends string>({
  options,
  selected,
  onChange,
  labelFor,
}: {
  options: T[];
  selected: T[];
  onChange: (v: T[]) => void;
  labelFor: (v: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: T) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full h-auto min-h-8 px-2 py-1 rounded-md border border-sidebar-border bg-sidebar text-left text-xs flex items-center justify-between gap-1',
          )}
        >
          {selected.length === 0 ? (
            <span className="text-sidebar-muted">Select values…</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selected.map((v) => (
                <Badge key={v} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {labelFor(v)}
                </Badge>
              ))}
            </div>
          )}
          <ChevronDown className="w-3 h-3 text-sidebar-muted shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {options.map((o) => (
            <label
              key={o}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
            >
              <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} />
              <span>{labelFor(o)}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Tags are a dynamic, user-created list (unlike the fixed status/service
// unions), so this doesn't reuse the generic MultiSelect<T extends string>
// above — it needs to look each id up in useTags() for its label/color.
function TagsMultiSelect({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const { data: tags = [] } = useTags();
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const byId = new Map(tags.map((t) => [t.id, t]));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full h-auto min-h-8 px-2 py-1 rounded-md border border-sidebar-border bg-sidebar text-left text-xs flex items-center justify-between gap-1',
          )}
        >
          {selected.length === 0 ? (
            <span className="text-sidebar-muted">Select tags…</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selected.map((id) => (
                <Badge key={id} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {byId.get(id)?.label ?? id}
                </Badge>
              ))}
            </div>
          )}
          <ChevronDown className="w-3 h-3 text-sidebar-muted shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {tags.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-sidebar-muted">No tags created yet.</p>
          )}
          {tags.map((tag) => (
            <label
              key={tag.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
            >
              <Checkbox checked={selected.includes(tag.id)} onCheckedChange={() => toggle(tag.id)} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
              <span>{tag.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TagInput({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar p-1 flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))}>
            <X className="w-2.5 h-2.5" />
          </button>
        </Badge>
      ))}
      <input
        className="flex-1 min-w-[60px] bg-transparent text-xs outline-none text-sidebar-foreground placeholder:text-sidebar-muted px-1"
        placeholder={values.length === 0 ? 'Type and press Enter…' : ''}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
      />
    </div>
  );
}

export default function ValueInput({ field, operator, value, onChange }: Props) {
  const meta = FIELD_META[field];

  // Enum selectors
  if (meta.type === 'enum-status' && value.kind === 'statuses') {
    return (
      <MultiSelect
        options={STATUS_OPTIONS}
        selected={value.values}
        onChange={(v) => onChange({ kind: 'statuses', values: v })}
        labelFor={(v) => statusConfig[v].label}
      />
    );
  }
  if (meta.type === 'enum-services' && value.kind === 'services') {
    return (
      <MultiSelect
        options={SERVICE_OPTIONS}
        selected={value.values}
        onChange={(v) => onChange({ kind: 'services', values: v })}
        labelFor={(v) => serviceConfig[v].label}
      />
    );
  }
  if (meta.type === 'enum-tags' && value.kind === 'tags') {
    return <TagsMultiSelect selected={value.values} onChange={(v) => onChange({ kind: 'tags', values: v })} />;
  }

  // Text fields
  if (meta.type === 'text') {
    if (value.kind === 'text') {
      return (
        <Input
          value={value.value}
          onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
          placeholder="Enter text…"
          className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
        />
      );
    }
    if (value.kind === 'strings') {
      return (
        <TagInput
          values={value.values}
          onChange={(v) => onChange({ kind: 'strings', values: v })}
        />
      );
    }
  }

  // Numbers
  if (meta.type === 'number') {
    if (value.kind === 'number') {
      return (
        <Input
          type="number"
          min={0}
          max={200}
          value={value.value ?? ''}
          onChange={(e) =>
            onChange({ kind: 'number', value: e.target.value === '' ? null : Number(e.target.value) })
          }
          placeholder="0-200"
          className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
        />
      );
    }
    if (value.kind === 'numberRange') {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={200}
            value={value.min ?? ''}
            onChange={(e) =>
              onChange({ ...value, min: e.target.value === '' ? null : Number(e.target.value) })
            }
            placeholder="Min"
            className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
          />
          <span className="text-xs text-sidebar-muted">–</span>
          <Input
            type="number"
            min={0}
            max={200}
            value={value.max ?? ''}
            onChange={(e) =>
              onChange({ ...value, max: e.target.value === '' ? null : Number(e.target.value) })
            }
            placeholder="Max"
            className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
          />
        </div>
      );
    }
  }

  // Date
  if (meta.type === 'date') {
    if (value.kind === 'date') {
      return (
        <Input
          type="date"
          value={value.value ?? ''}
          onChange={(e) => onChange({ kind: 'date', value: e.target.value || null })}
          className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
        />
      );
    }
    if (value.kind === 'dateRange') {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={value.start ?? ''}
            onChange={(e) => onChange({ ...value, start: e.target.value || null })}
            className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
          />
          <span className="text-xs text-sidebar-muted">–</span>
          <Input
            type="date"
            value={value.end ?? ''}
            onChange={(e) => onChange({ ...value, end: e.target.value || null })}
            className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
          />
        </div>
      );
    }
    if (value.kind === 'days') {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            value={value.value ?? ''}
            onChange={(e) =>
              onChange({ kind: 'days', value: e.target.value === '' ? null : Number(e.target.value) })
            }
            className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border"
          />
          <span className="text-xs text-sidebar-muted shrink-0">days</span>
        </div>
      );
    }
  }

  return null;
}
