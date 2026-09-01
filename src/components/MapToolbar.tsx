import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListFilter, ArrowUpDown, X } from 'lucide-react';
import { useAppStore, useFilteredAccounts, MapSortColumn } from '@/store/appStore';
import { useFilterScope } from '@/components/filters/useFilterScope';
import AdvancedFilterPanel from '@/components/filters/AdvancedFilterPanel';
import { FilterCondition, FilterGroup, FIELD_META, OPERATOR_LABELS } from '@/types/filters';
import { statusConfig, serviceConfig, FULL_SERVICE_CONFIG } from '@/types/account';
import { useTags, type Tag } from '@/hooks/useTags';
import { cn } from '@/lib/utils';

function describeCondition(cond: FilterCondition, tagsById: Map<string, Tag>): string {
  const meta = FIELD_META[cond.field];
  const opLabel = OPERATOR_LABELS[cond.operator];
  const { value } = cond;
  let valueLabel = '';
  switch (value.kind) {
    case 'statuses':
      valueLabel = value.values.map((v) => statusConfig[v].label).join(', ');
      break;
    case 'services':
      valueLabel = value.values
        .map((v) => (v === 'fullService' ? FULL_SERVICE_CONFIG.label : serviceConfig[v].label))
        .join(', ');
      break;
    case 'tags':
      valueLabel = value.values.map((id) => tagsById.get(id)?.label ?? id).join(', ');
      break;
    case 'strings':
      valueLabel = value.values.join(', ');
      break;
    case 'text':
      valueLabel = value.value;
      break;
    case 'number':
      valueLabel = value.value != null ? String(value.value) : '';
      break;
    case 'numberRange':
      valueLabel = `${value.min ?? '—'}–${value.max ?? '—'}`;
      break;
    case 'date':
      valueLabel = value.value ?? '';
      break;
    case 'dateRange':
      valueLabel = `${value.start ?? '—'}–${value.end ?? '—'}`;
      break;
    case 'days':
      valueLabel = value.value != null ? `${value.value}d` : '';
      break;
    case 'none':
      valueLabel = '';
      break;
  }
  return valueLabel ? `${meta.label} ${opLabel} ${valueLabel}` : meta.label;
}

// Encore's core segments — Keep (active), Win Back (canceled), Go Get (lead) —
// come from the status description prefix, so a single-status filter reads as
// a friendly segment name instead of a raw "Status is X" condition dump.
function segmentChipLabel(group: FilterGroup): string | null {
  if (group.conditions.length !== 1) return null;
  const c = group.conditions[0];
  if (c.field !== 'status' || c.value.kind !== 'statuses' || c.value.values.length !== 1) return null;
  const [prefix] = statusConfig[c.value.values[0]].description.split(' — ');
  return prefix ? `Segment: ${prefix}` : null;
}

function chipLabelForGroup(group: FilterGroup, tagsById: Map<string, Tag>): string {
  return segmentChipLabel(group) ??
    (group.conditions.map((c) => describeCondition(c, tagsById)).join(' & ') || 'Empty filter');
}

const SORT_OPTIONS: { column: MapSortColumn; label: string }[] = [
  { column: 'accountName', label: 'Account Name' },
  { column: 'status', label: 'Status' },
  { column: 'city', label: 'City' },
  { column: 'lastVisitDate', label: 'Last Visit' },
];

export default function MapToolbar() {
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const accounts = useAppStore((s) => s.accounts);
  const mapSort = useAppStore((s) => s.mapSort);
  const setMapSort = useAppStore((s) => s.setMapSort);
  const filteredAccounts = useFilteredAccounts();
  const { filters, removeFilterGroup } = useFilterScope('map');
  const { data: tags = [] } = useTags();
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const currentSortLabel = mapSort
    ? SORT_OPTIONS.find((o) => o.column === mapSort.column)?.label
    : null;

  const toggleSort = (column: MapSortColumn) => {
    if (mapSort?.column === column) {
      setMapSort(mapSort.direction === 'asc' ? { column, direction: 'desc' } : null);
    } else {
      setMapSort({ column, direction: 'asc' });
    }
  };

  return (
    <div
      className={cn(
        'fixed top-14 z-20 h-11 transition-all duration-300',
        'flex items-center gap-2 px-4',
        'bg-card/95 backdrop-blur-sm border-b',
        isSidebarOpen ? 'left-72' : 'left-0 md:left-16',
        'right-0 md:right-14'
      )}
    >
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        <span className="font-semibold text-foreground">
          {filteredAccounts.length}/{accounts.length}
        </span>{' '}
        accounts
      </span>

      <div className="h-4 w-px bg-border shrink-0" />

      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <ListFilter className="w-3.5 h-3.5" />
            Add filter
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-3 bg-sidebar text-sidebar-foreground border-sidebar-border"
          align="start"
        >
          <AdvancedFilterPanel />
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
        {filters.map((group) => (
          <Badge
            key={group.id}
            variant="secondary"
            className="gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-medium whitespace-nowrap shrink-0"
          >
            {chipLabelForGroup(group, tagsById)}
            <button
              onClick={() => removeFilterGroup(group.id)}
              className="rounded-full hover:bg-foreground/10 p-0.5 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex-1" />

      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {currentSortLabel ? `Sort: ${currentSortLabel}` : 'Sort'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="end">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.column}
              onClick={() => toggleSort(o.column)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
            >
              <span>{o.label}</span>
              {mapSort?.column === o.column && (
                <span className="text-xs text-muted-foreground">
                  {mapSort.direction === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
