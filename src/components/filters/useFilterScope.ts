import { useAppStore } from '@/store/appStore';
import type { FilterCondition, FilterGroup } from '@/types/filters';

export type FilterScope = 'map' | 'list' | 'sequence';

interface FilterScopeApi {
  filters: FilterGroup[];
  addFilterGroup: () => void;
  duplicateFilterGroup: (groupId: string) => void;
  removeFilterGroup: (groupId: string) => void;
  addFilterCondition: (groupId: string) => void;
  updateFilterCondition: (groupId: string, condId: string, patch: Partial<FilterCondition>) => void;
  removeFilterCondition: (groupId: string, condId: string) => void;
  clearAdvancedFilters: () => void;
}

export function useFilterScope(scope: FilterScope = 'map'): FilterScopeApi {
  return {
    filters: useAppStore((s) => (
      scope === 'list' ? s.listAdvancedFilters : scope === 'sequence' ? s.sequenceAdvancedFilters : s.advancedFilters
    )),
    addFilterGroup: useAppStore((s) => (
      scope === 'list' ? s.addListFilterGroup : scope === 'sequence' ? s.addSequenceFilterGroup : s.addFilterGroup
    )),
    duplicateFilterGroup: useAppStore((s) => (
      scope === 'list' ? s.duplicateListFilterGroup : scope === 'sequence' ? s.duplicateSequenceFilterGroup : s.duplicateFilterGroup
    )),
    removeFilterGroup: useAppStore((s) => (
      scope === 'list' ? s.removeListFilterGroup : scope === 'sequence' ? s.removeSequenceFilterGroup : s.removeFilterGroup
    )),
    addFilterCondition: useAppStore((s) => (
      scope === 'list' ? s.addListFilterCondition : scope === 'sequence' ? s.addSequenceFilterCondition : s.addFilterCondition
    )),
    updateFilterCondition: useAppStore((s) => (
      scope === 'list' ? s.updateListFilterCondition : scope === 'sequence' ? s.updateSequenceFilterCondition : s.updateFilterCondition
    )),
    removeFilterCondition: useAppStore((s) => (
      scope === 'list' ? s.removeListFilterCondition : scope === 'sequence' ? s.removeSequenceFilterCondition : s.removeFilterCondition
    )),
    clearAdvancedFilters: useAppStore((s) => (
      scope === 'list' ? s.clearListAdvancedFilters : scope === 'sequence' ? s.clearSequenceAdvancedFilters : s.clearAdvancedFilters
    )),
  };
}
