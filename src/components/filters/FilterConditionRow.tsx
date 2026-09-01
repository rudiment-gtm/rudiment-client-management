import { X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FIELD_META,
  FilterCondition,
  FilterField,
  FilterOperator,
  OPERATOR_LABELS,
  defaultValueFor,
} from '@/types/filters';
import ValueInput from './ValueInput';
import { useFilterScope, type FilterScope } from './useFilterScope';

interface Props {
  groupId: string;
  condition: FilterCondition;
  scope?: FilterScope;
}

const FIELD_OPTIONS: FilterField[] = [
  'status',
  'services',
  'tags',
  'city',
  'state',
  'lastVisitDate',
  'lastContactedDate',
];

export default function FilterConditionRow({ groupId, condition, scope = 'map' }: Props) {
  const { updateFilterCondition, removeFilterCondition } = useFilterScope(scope);
  const meta = FIELD_META[condition.field];


  const onFieldChange = (next: FilterField) => {
    const m = FIELD_META[next];
    const op = m.defaultOperator;
    updateFilterCondition(groupId, condition.id, {
      field: next,
      operator: op,
      value: defaultValueFor(next, op),
    });
  };

  const onOperatorChange = (next: FilterOperator) => {
    updateFilterCondition(groupId, condition.id, {
      operator: next,
      value: defaultValueFor(condition.field, next),
    });
  };

  const showValue = condition.operator !== 'is_known' && condition.operator !== 'is_unknown';

  return (
    <div className="rounded-md bg-sidebar/40 p-2 space-y-1.5 relative group/row">
      <button
        onClick={() => removeFilterCondition(groupId, condition.id)}
        className="absolute top-1.5 right-1.5 p-0.5 text-sidebar-muted hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity"
        title="Remove filter"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <Select value={condition.field} onValueChange={(v) => onFieldChange(v as FilterField)}>
        <SelectTrigger className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELD_OPTIONS.map((f) => (
            <SelectItem key={f} value={f}>{FIELD_META[f].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={condition.operator} onValueChange={(v) => onOperatorChange(v as FilterOperator)}>
        <SelectTrigger className="h-8 text-xs bg-sidebar text-sidebar-foreground border-sidebar-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {meta.operators.map((op) => (
            <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showValue && (
        <ValueInput
          field={condition.field}
          operator={condition.operator}
          value={condition.value}
          onChange={(value) => updateFilterCondition(groupId, condition.id, { value })}
        />
      )}
    </div>
  );
}
