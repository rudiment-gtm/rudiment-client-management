import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import FilterGroupCard from './FilterGroupCard';
import { useFilterScope, type FilterScope } from './useFilterScope';

interface Props {
  scope?: FilterScope;
}

export default function AdvancedFilterPanel({ scope = 'map' }: Props) {
  const { filters, addFilterGroup, clearAdvancedFilters } = useFilterScope(scope);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider">
          Filters
        </h2>
        {filters.length > 0 && (
          <button
            onClick={clearAdvancedFilters}
            className="text-xs text-sidebar-muted hover:text-sidebar-foreground flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {filters.length === 0 && (
        <p className="text-xs text-sidebar-muted">
          No filters applied. Showing all accounts.
        </p>
      )}

      <div className="space-y-2">
        {filters.map((group, idx) => (
          <div key={group.id} className="space-y-2">
            <FilterGroupCard group={group} index={idx} scope={scope} />
            {idx < filters.length - 1 && (
              <div className="flex items-center justify-center">
                <span className="text-[10px] font-semibold text-sidebar-muted uppercase tracking-wider bg-sidebar-accent px-2 py-0.5 rounded">
                  or
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addFilterGroup}
        className="w-full gap-1.5 bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <Plus className="w-3.5 h-3.5" />
        {filters.length === 0 ? 'Add filter' : 'Add filter group'}
      </Button>
    </div>
  );
}
