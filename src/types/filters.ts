import { AccountStatus, ServiceType } from './account';

export type FilterField =
  | 'status'
  | 'services'
  | 'tags'
  | 'city'
  | 'state'
  | 'lastVisitDate'
  | 'lastContactedDate';

export type FilterOperator =
  // multi-value enum/text
  | 'in'
  | 'not_in'
  // text
  | 'contains'
  // existence
  | 'is_known'
  | 'is_unknown'
  // number
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  // date
  | 'on'
  | 'before'
  | 'after'
  | 'last_n_days';

export type FilterValue =
  | { kind: 'none' }
  | { kind: 'strings'; values: string[] }
  | { kind: 'statuses'; values: AccountStatus[] }
  | { kind: 'services'; values: ServiceType[] }
  | { kind: 'tags'; values: string[] }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number | null }
  | { kind: 'numberRange'; min: number | null; max: number | null }
  | { kind: 'date'; value: string | null }
  | { kind: 'dateRange'; start: string | null; end: string | null }
  | { kind: 'days'; value: number | null };

export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: FilterValue;
}

export interface FilterGroup {
  id: string;
  conditions: FilterCondition[];
}

export type AdvancedFilters = FilterGroup[];

export interface FieldMeta {
  field: FilterField;
  label: string;
  type: 'enum-status' | 'enum-services' | 'enum-tags' | 'text' | 'number' | 'date';
  operators: FilterOperator[];
  defaultOperator: FilterOperator;
}

export const FIELD_META: Record<FilterField, FieldMeta> = {
  status: {
    field: 'status',
    label: 'Status',
    type: 'enum-status',
    operators: ['in', 'not_in'],
    defaultOperator: 'in',
  },
  services: {
    field: 'services',
    label: 'Services',
    type: 'enum-services',
    operators: ['in', 'not_in'],
    defaultOperator: 'in',
  },
  tags: {
    field: 'tags',
    label: 'Tag',
    type: 'enum-tags',
    operators: ['in', 'not_in'],
    defaultOperator: 'in',
  },
  city: {
    field: 'city',
    label: 'City',
    type: 'text',
    operators: ['in', 'not_in', 'contains', 'is_known', 'is_unknown'],
    defaultOperator: 'in',
  },
  state: {
    field: 'state',
    label: 'State',
    type: 'text',
    operators: ['in', 'not_in', 'is_known', 'is_unknown'],
    defaultOperator: 'in',
  },
  lastVisitDate: {
    field: 'lastVisitDate',
    label: 'Last Visit Date',
    type: 'date',
    operators: ['on', 'before', 'after', 'between', 'last_n_days', 'is_known', 'is_unknown'],
    defaultOperator: 'after',
  },
  lastContactedDate: {
    field: 'lastContactedDate',
    label: 'Last Contacted',
    type: 'date',
    operators: ['on', 'before', 'after', 'between', 'last_n_days', 'is_known', 'is_unknown'],
    defaultOperator: 'after',
  },
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  in: 'is any of',
  not_in: 'is none of',
  contains: 'contains',
  is_known: 'is known',
  is_unknown: 'is unknown',
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: 'between',
  on: 'is',
  before: 'is before',
  after: 'is after',
  last_n_days: 'in the last (days)',
};

export function defaultValueFor(field: FilterField, op: FilterOperator): FilterValue {
  if (op === 'is_known' || op === 'is_unknown') return { kind: 'none' };
  const meta = FIELD_META[field];
  switch (meta.type) {
    case 'enum-status':
      return { kind: 'statuses', values: [] };
    case 'enum-services':
      return { kind: 'services', values: [] };
    case 'enum-tags':
      return { kind: 'tags', values: [] };
    case 'text':
      if (op === 'contains') return { kind: 'text', value: '' };
      return { kind: 'strings', values: [] };
    case 'number':
      if (op === 'between') return { kind: 'numberRange', min: null, max: null };
      return { kind: 'number', value: null };
    case 'date':
      if (op === 'between') return { kind: 'dateRange', start: null, end: null };
      if (op === 'last_n_days') return { kind: 'days', value: 7 };
      return { kind: 'date', value: null };
  }
}
