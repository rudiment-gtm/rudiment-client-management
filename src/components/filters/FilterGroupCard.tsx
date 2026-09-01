import { Button } from '@/components/ui/button';
import { Copy, Plus, X } from 'lucide-react';
import { FilterGroup } from '@/types/filters';
import FilterConditionRow from './FilterConditionRow';
import { useFilterScope, type FilterScope } from './useFilterScope';

interface Props {
  group: FilterGroup;
  index: number;
  scope?: FilterScope;
}

export default function FilterGroupCard({ group, index, scope = 'map' }: Props) {
  const { addFilterCondition, duplicateFilterGroup, removeFilterGroup } = useFilterScope(scope);

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-sidebar-foreground">
          Group {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => duplicateFilterGroup(group.id)}
            title="Duplicate group"
            className="p-1 text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => removeFilterGroup(group.id)}
            title="Delete group"
            className="p-1 text-sidebar-muted hover:text-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {group.conditions.map((cond, i) => (
          <div key={cond.id} className="space-y-2">
            <FilterConditionRow groupId={group.id} condition={cond} scope={scope} />
            {i < group.conditions.length - 1 && (
              <div className="text-[10px] font-semibold text-sidebar-muted uppercase tracking-wider pl-1">
                and
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => addFilterCondition(group.id)}
        className="w-full gap-1.5 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent h-7"
      >
        <Plus className="w-3 h-3" />
        Add filter
      </Button>
    </div>
  );
}
