import { Account } from '@/types/account';
import { FilterCondition, FilterGroup } from '@/types/filters';

const normStr = (s: string | undefined | null) => (s ?? '').trim().toLowerCase();

function fieldValue(account: Account, field: FilterCondition['field']): unknown {
  switch (field) {
    case 'status': return account.accountStatus;
    case 'services': return account.services;
    case 'tags': return account.tags;
    case 'city': return account.routeCity;
    case 'state': return account.routeState;
    case 'lastVisitDate': return account.lastVisitDate;
    case 'lastContactedDate': return account.lastContactedAt ?? undefined;
  }
}

function isKnown(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  if (typeof v === 'number' && Number.isNaN(v)) return false;
  return true;
}

function evaluateCondition(account: Account, cond: FilterCondition): boolean {
  const v = fieldValue(account, cond.field);
  const { operator, value } = cond;

  if (operator === 'is_known') return isKnown(v);
  if (operator === 'is_unknown') return !isKnown(v);

  switch (value.kind) {
    case 'statuses': {
      const arr = value.values as string[];
      if (arr.length === 0) return true;
      const match = typeof v === 'string' && arr.includes(v);
      return operator === 'not_in' ? !match : match;
    }
    case 'services': {
      const arr = value.values as string[];
      if (arr.length === 0) return true;
      const accountServices = Array.isArray(v) ? (v as string[]) : [];
      const match = arr.some((s) => accountServices.includes(s));
      return operator === 'not_in' ? !match : match;
    }
    case 'tags': {
      const arr = value.values;
      if (arr.length === 0) return true;
      const accountTags = Array.isArray(v) ? (v as string[]) : [];
      const match = arr.some((id) => accountTags.includes(id));
      return operator === 'not_in' ? !match : match;
    }
    case 'strings': {
      if (value.values.length === 0) return true;
      const lv = normStr(v as string);
      const match = value.values.map(normStr).includes(lv);
      return operator === 'not_in' ? !match : match;
    }
    case 'text': {
      if (!value.value) return true;
      return normStr(v as string).includes(normStr(value.value));
    }
    case 'number': {
      if (value.value === null || typeof v !== 'number') return false;
      switch (operator) {
        case 'eq': return v === value.value;
        case 'neq': return v !== value.value;
        case 'gt': return v > value.value;
        case 'gte': return v >= value.value;
        case 'lt': return v < value.value;
        case 'lte': return v <= value.value;
      }
      return false;
    }
    case 'numberRange': {
      if (typeof v !== 'number') return false;
      if (value.min !== null && v < value.min) return false;
      if (value.max !== null && v > value.max) return false;
      return true;
    }
    case 'date': {
      if (!value.value || typeof v !== 'string' || !v) return false;
      const lhs = new Date(v).getTime();
      const rhs = new Date(value.value).getTime();
      if (Number.isNaN(lhs) || Number.isNaN(rhs)) return false;
      switch (operator) {
        case 'on': {
          const a = new Date(v).toISOString().slice(0, 10);
          const b = new Date(value.value).toISOString().slice(0, 10);
          return a === b;
        }
        case 'before': return lhs < rhs;
        case 'after': return lhs > rhs;
      }
      return false;
    }
    case 'dateRange': {
      if (typeof v !== 'string' || !v) return false;
      const t = new Date(v).getTime();
      if (Number.isNaN(t)) return false;
      if (value.start && t < new Date(value.start).getTime()) return false;
      if (value.end && t > new Date(value.end).getTime()) return false;
      return true;
    }
    case 'days': {
      if (value.value === null || typeof v !== 'string' || !v) return false;
      const t = new Date(v).getTime();
      if (Number.isNaN(t)) return false;
      const cutoff = Date.now() - value.value * 86400000;
      return t >= cutoff;
    }
    case 'none':
      return true;
  }
}

export function evaluateFilters(account: Account, groups: FilterGroup[]): boolean {
  const nonEmpty = groups.filter((g) => g.conditions.length > 0);
  if (nonEmpty.length === 0) return true;
  return nonEmpty.some((g) => g.conditions.every((c) => evaluateCondition(account, c)));
}
