import { create } from 'zustand';
import { Account, AccountStatus, ServiceType, ALL_SERVICE_TYPES } from '@/types/account';
import type { AroundMeResult } from '@/lib/aroundMeSearch';
import type { ProspectCategory } from '@/types/account';
import { FilterCondition, FilterField, FilterGroup, FIELD_META, defaultValueFor } from '@/types/filters';
import { evaluateFilters } from '@/lib/filterEvaluator';

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2));

const makeCondition = (field: FilterField = 'status'): FilterCondition => {
  const meta = FIELD_META[field];
  return {
    id: uid(),
    field,
    operator: meta.defaultOperator,
    value: defaultValueFor(field, meta.defaultOperator),
  };
};

const makeGroup = (): FilterGroup => ({ id: uid(), conditions: [makeCondition()] });

export type SearchOrigin =
  | { kind: 'user' }
  | { kind: 'account'; accountId: string }
  | { kind: 'mapCenter' };

export type RouteStop =
  | { kind: 'account'; id: string }
  | {
      kind: 'aroundMe';
      id: string; // `am:${result.id}`
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      prospectCategory: ProspectCategory;
      category: string;
    };

const aroundMeStopId = (resultId: string) => `am:${resultId}`;

// Sort applied to the map toolbar's filtered account list.
export type MapSortColumn = 'accountName' | 'status' | 'city' | 'lastVisitDate';
export interface MapSortState {
  column: MapSortColumn;
  direction: 'asc' | 'desc';
}

// Quick-filter toggles shown as pills in the sidebar — one per status/service value.
export interface StatusFilterState {
  lead: boolean;
  active: boolean;
  canceled: boolean;
  new_customer: boolean;
}

export interface ServiceFilterState {
  buildingEngineering: boolean;
  facilitySolutions: boolean;
  janitorial: boolean;
  specialProjects: boolean;
  landscape: boolean;
  fullService: boolean;
}

interface AppState {
  // Accounts data (comes from useAccounts hook, kept here for UI convenience)
  accounts: Account[];
  selectedAccount: Account | null;

  // Quick-filter state (simple pill toggles, separate from the advanced builder)
  statusFilters: StatusFilterState;
  serviceFilters: ServiceFilterState;

  // Advanced filter builder
  advancedFilters: FilterGroup[];
  /** True once the user's persisted filters have been loaded from the server. Writes are gated on this. */
  filtersHydrated: boolean;

  // List-view-only advanced filter builder (ephemeral, not persisted)
  listAdvancedFilters: FilterGroup[];

  // Sequence-editor-only advanced filter builder — holds whichever
  // sequence's audience filter is currently being edited; loaded from that
  // sequence's filter_groups on open, written back into the row on Save.
  sequenceAdvancedFilters: FilterGroup[];

  // Sort applied to the map toolbar's filtered account list
  mapSort: MapSortState | null;

  // Route planning
  isRouteModeActive: boolean;
  routeStops: RouteStop[];
  /** Derived: just the account-kind stop IDs, in order. Kept in sync on every routeStops change. */
  selectedAccountsForRoute: string[];

  // UI state
  isSidebarOpen: boolean;
  isDrawerOpen: boolean;
  activeTab: 'map' | 'chat' | 'leads' | 'workflows' | 'tasks' | 'sequences' | 'replies' | 'dashboard';
  setActiveTab: (tab: 'map' | 'chat' | 'leads' | 'workflows' | 'tasks' | 'sequences' | 'replies' | 'dashboard') => void;

  // A CSV import can be triggered from the Map view (not just the Prospect
  // tab) — this hands the resulting pool-company ids to the Prospect tab so
  // its "Import All to Map" review banner shows up there regardless of
  // where the import started. Cleared once ProspectView consumes it.
  pendingPoolImport: { ids: string[]; count: number } | null;
  setPendingPoolImport: (v: { ids: string[]; count: number } | null) => void;

  // Map state
  mapCenter: [number, number];
  mapZoom: number;

  // User location
  userLocation: [number, number] | null;

  // Around Me search
  aroundMeResults: AroundMeResult[];
  isAroundMeOpen: boolean;
  aroundMePhrase: string;
  aroundMeOrigin: SearchOrigin | null;
  aroundMeOriginLabel: string;
  aroundMeCategories: ProspectCategory[];

  // Actions
  setSelectedAccount: (account: Account | null) => void;
  setAroundMeResults: (results: AroundMeResult[], phrase: string, originLabel: string, categories: ProspectCategory[]) => void;
  clearAroundMeResults: () => void;
  setAroundMeOpen: (open: boolean) => void;
  setAroundMeOrigin: (origin: SearchOrigin | null) => void;
  openAroundMeWithOrigin: (origin: SearchOrigin | null) => void;
  toggleStatusFilter: (filter: keyof StatusFilterState) => void;
  setAllStatusFilters: (value: boolean) => void;
  toggleServiceFilter: (service: keyof ServiceFilterState) => void;
  setAllServiceFilters: (value: boolean) => void;
  addFilterGroup: () => void;
  duplicateFilterGroup: (groupId: string) => void;
  removeFilterGroup: (groupId: string) => void;
  addFilterCondition: (groupId: string) => void;
  updateFilterCondition: (groupId: string, condId: string, patch: Partial<FilterCondition>) => void;
  removeFilterCondition: (groupId: string, condId: string) => void;
  clearAdvancedFilters: () => void;
  setAdvancedFilters: (groups: FilterGroup[]) => void;
  setFiltersHydrated: (v: boolean) => void;
  setMapSort: (sort: MapSortState | null) => void;

  // List-scoped variants
  addListFilterGroup: () => void;
  duplicateListFilterGroup: (groupId: string) => void;
  removeListFilterGroup: (groupId: string) => void;
  addListFilterCondition: (groupId: string) => void;
  updateListFilterCondition: (groupId: string, condId: string, patch: Partial<FilterCondition>) => void;
  removeListFilterCondition: (groupId: string, condId: string) => void;
  clearListAdvancedFilters: () => void;
  setListAdvancedFilters: (groups: FilterGroup[]) => void;

  // Sequence-scoped variants
  addSequenceFilterGroup: () => void;
  duplicateSequenceFilterGroup: (groupId: string) => void;
  removeSequenceFilterGroup: (groupId: string) => void;
  addSequenceFilterCondition: (groupId: string) => void;
  updateSequenceFilterCondition: (groupId: string, condId: string, patch: Partial<FilterCondition>) => void;
  removeSequenceFilterCondition: (groupId: string, condId: string) => void;
  clearSequenceAdvancedFilters: () => void;
  setSequenceAdvancedFilters: (groups: FilterGroup[]) => void;

  toggleRouteMode: () => void;
  toggleAccountForRoute: (accountId: string) => void;
  toggleAroundMeForRoute: (result: AroundMeResult, prospectCategory?: ProspectCategory) => void;
  isStopInRoute: (stopId: string) => boolean;
  reorderRouteStops: (fromIndex: number, toIndex: number) => void;
  clearRouteSelection: () => void;
  loadRouteFromSnapshot: (stops: RouteStop[]) => void;
  loadedSavedRouteId: string | null;
  setLoadedSavedRouteId: (id: string | null) => void;
  toggleSidebar: () => void;
  setDrawerOpen: (open: boolean) => void;
  setMapView: (center: [number, number], zoom: number) => void;
  updateAccountStatus: (accountId: string, status: AccountStatus) => void;
  updateAccountFields: (accountId: string, patch: Partial<Account>) => void;
  logVisit: (accountId: string, notes?: string) => void;
  setAccounts: (accounts: Account[]) => void;
  setUserLocation: (location: [number, number] | null) => void;
}

const deriveAccountIds = (stops: RouteStop[]) =>
  stops.filter((s): s is Extract<RouteStop, { kind: 'account' }> => s.kind === 'account').map((s) => s.id);

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state - empty, loaded from database via useAccounts hook
  accounts: [],
  selectedAccount: null,

  // Filters start as false - will be updated when accounts are loaded
  statusFilters: {
    lead: false,
    active: false,
    canceled: false,
    new_customer: false,
  },

  serviceFilters: {
    buildingEngineering: false,
    facilitySolutions: false,
    janitorial: false,
    specialProjects: false,
    landscape: false,
    fullService: false,
  },

  advancedFilters: [],
  filtersHydrated: false,
  listAdvancedFilters: [],
  sequenceAdvancedFilters: [],
  mapSort: null,

  isRouteModeActive: false,
  routeStops: [],
  selectedAccountsForRoute: [],

  isSidebarOpen: true,
  isDrawerOpen: false,
  activeTab: 'map',
  setActiveTab: (tab) => set({ activeTab: tab }),
  pendingPoolImport: null,
  setPendingPoolImport: (v) => set({ pendingPoolImport: v }),

  // Default map center — overridden once accounts/user location load
  mapCenter: [-97.743057, 30.267153],
  mapZoom: 11,

  // User location starts as null
  userLocation: null,

  // Around Me defaults
  aroundMeResults: [],
  isAroundMeOpen: false,
  aroundMePhrase: '',
  aroundMeOrigin: null,
  aroundMeOriginLabel: 'your location',
  aroundMeCategories: [],

  // Actions
  setSelectedAccount: (account) => set({
    selectedAccount: account,
    isDrawerOpen: account !== null
  }),

  setAroundMeResults: (results, phrase, originLabel, categories) => set({ aroundMeResults: results, aroundMePhrase: phrase, aroundMeOriginLabel: originLabel, aroundMeCategories: categories }),
  clearAroundMeResults: () => set({ aroundMeResults: [], aroundMePhrase: '', aroundMeCategories: [] }),
  setAroundMeOpen: (open) => set({ isAroundMeOpen: open }),
  setAroundMeOrigin: (origin) => set({ aroundMeOrigin: origin }),
  openAroundMeWithOrigin: (origin) => set({ aroundMeOrigin: origin, isAroundMeOpen: true }),

  toggleStatusFilter: (filter) => set((state) => ({
    statusFilters: {
      ...state.statusFilters,
      [filter]: !state.statusFilters[filter],
    },
  })),

  setAllStatusFilters: (value) => set({
    statusFilters: {
      lead: value,
      active: value,
      canceled: value,
      new_customer: value,
    },
  }),

  toggleServiceFilter: (service) => set((state) => ({
    serviceFilters: {
      ...state.serviceFilters,
      [service]: !state.serviceFilters[service],
    },
  })),

  setAllServiceFilters: (value) => set({
    serviceFilters: {
      buildingEngineering: value,
      facilitySolutions: value,
      janitorial: value,
      specialProjects: value,
      landscape: value,
      fullService: value,
    },
  }),

  addFilterGroup: () => set((state) => ({ advancedFilters: [...state.advancedFilters, makeGroup()] })),
  duplicateFilterGroup: (groupId) => set((state) => {
    const g = state.advancedFilters.find((x) => x.id === groupId);
    if (!g) return {};
    const clone: FilterGroup = {
      id: uid(),
      conditions: g.conditions.map((c) => ({ ...c, id: uid() })),
    };
    const idx = state.advancedFilters.findIndex((x) => x.id === groupId);
    const next = [...state.advancedFilters];
    next.splice(idx + 1, 0, clone);
    return { advancedFilters: next };
  }),
  removeFilterGroup: (groupId) => set((state) => ({
    advancedFilters: state.advancedFilters.filter((g) => g.id !== groupId),
  })),
  addFilterCondition: (groupId) => set((state) => ({
    advancedFilters: state.advancedFilters.map((g) =>
      g.id === groupId ? { ...g, conditions: [...g.conditions, makeCondition()] } : g
    ),
  })),
  updateFilterCondition: (groupId, condId, patch) => set((state) => ({
    advancedFilters: state.advancedFilters.map((g) =>
      g.id !== groupId ? g : {
        ...g,
        conditions: g.conditions.map((c) => (c.id === condId ? { ...c, ...patch } : c)),
      }
    ),
  })),
  removeFilterCondition: (groupId, condId) => set((state) => ({
    advancedFilters: state.advancedFilters.map((g) =>
      g.id !== groupId ? g : { ...g, conditions: g.conditions.filter((c) => c.id !== condId) }
    ).filter((g) => g.conditions.length > 0),
  })),
  clearAdvancedFilters: () => set({ advancedFilters: [] }),
  setAdvancedFilters: (groups) => set({ advancedFilters: groups }),
  setFiltersHydrated: (v) => set({ filtersHydrated: v }),
  setMapSort: (sort) => set({ mapSort: sort }),

  addListFilterGroup: () => set((state) => ({ listAdvancedFilters: [...state.listAdvancedFilters, makeGroup()] })),
  duplicateListFilterGroup: (groupId) => set((state) => {
    const g = state.listAdvancedFilters.find((x) => x.id === groupId);
    if (!g) return {};
    const clone: FilterGroup = {
      id: uid(),
      conditions: g.conditions.map((c) => ({ ...c, id: uid() })),
    };
    const idx = state.listAdvancedFilters.findIndex((x) => x.id === groupId);
    const next = [...state.listAdvancedFilters];
    next.splice(idx + 1, 0, clone);
    return { listAdvancedFilters: next };
  }),
  removeListFilterGroup: (groupId) => set((state) => ({
    listAdvancedFilters: state.listAdvancedFilters.filter((g) => g.id !== groupId),
  })),
  addListFilterCondition: (groupId) => set((state) => ({
    listAdvancedFilters: state.listAdvancedFilters.map((g) =>
      g.id === groupId ? { ...g, conditions: [...g.conditions, makeCondition()] } : g
    ),
  })),
  updateListFilterCondition: (groupId, condId, patch) => set((state) => ({
    listAdvancedFilters: state.listAdvancedFilters.map((g) =>
      g.id !== groupId ? g : {
        ...g,
        conditions: g.conditions.map((c) => (c.id === condId ? { ...c, ...patch } : c)),
      }
    ),
  })),
  removeListFilterCondition: (groupId, condId) => set((state) => ({
    listAdvancedFilters: state.listAdvancedFilters.map((g) =>
      g.id !== groupId ? g : { ...g, conditions: g.conditions.filter((c) => c.id !== condId) }
    ).filter((g) => g.conditions.length > 0),
  })),
  clearListAdvancedFilters: () => set({ listAdvancedFilters: [] }),
  setListAdvancedFilters: (groups) => set({ listAdvancedFilters: groups }),

  addSequenceFilterGroup: () => set((state) => ({ sequenceAdvancedFilters: [...state.sequenceAdvancedFilters, makeGroup()] })),
  duplicateSequenceFilterGroup: (groupId) => set((state) => {
    const g = state.sequenceAdvancedFilters.find((x) => x.id === groupId);
    if (!g) return {};
    const clone: FilterGroup = {
      id: uid(),
      conditions: g.conditions.map((c) => ({ ...c, id: uid() })),
    };
    const idx = state.sequenceAdvancedFilters.findIndex((x) => x.id === groupId);
    const next = [...state.sequenceAdvancedFilters];
    next.splice(idx + 1, 0, clone);
    return { sequenceAdvancedFilters: next };
  }),
  removeSequenceFilterGroup: (groupId) => set((state) => ({
    sequenceAdvancedFilters: state.sequenceAdvancedFilters.filter((g) => g.id !== groupId),
  })),
  addSequenceFilterCondition: (groupId) => set((state) => ({
    sequenceAdvancedFilters: state.sequenceAdvancedFilters.map((g) =>
      g.id === groupId ? { ...g, conditions: [...g.conditions, makeCondition()] } : g
    ),
  })),
  updateSequenceFilterCondition: (groupId, condId, patch) => set((state) => ({
    sequenceAdvancedFilters: state.sequenceAdvancedFilters.map((g) =>
      g.id !== groupId ? g : {
        ...g,
        conditions: g.conditions.map((c) => (c.id === condId ? { ...c, ...patch } : c)),
      }
    ),
  })),
  removeSequenceFilterCondition: (groupId, condId) => set((state) => ({
    sequenceAdvancedFilters: state.sequenceAdvancedFilters.map((g) =>
      g.id !== groupId ? g : { ...g, conditions: g.conditions.filter((c) => c.id !== condId) }
    ).filter((g) => g.conditions.length > 0),
  })),
  clearSequenceAdvancedFilters: () => set({ sequenceAdvancedFilters: [] }),
  setSequenceAdvancedFilters: (groups) => set({ sequenceAdvancedFilters: groups }),

  toggleRouteMode: () => set((state) => {
    const turningOff = state.isRouteModeActive;
    return {
      isRouteModeActive: !state.isRouteModeActive,
      routeStops: turningOff ? [] : state.routeStops,
      selectedAccountsForRoute: turningOff ? [] : state.selectedAccountsForRoute,
      loadedSavedRouteId: turningOff ? null : state.loadedSavedRouteId,
    };
  }),

  toggleAccountForRoute: (accountId) => set((state) => {
    const exists = state.routeStops.some((s) => s.kind === 'account' && s.id === accountId);
    const nextStops: RouteStop[] = exists
      ? state.routeStops.filter((s) => !(s.kind === 'account' && s.id === accountId))
      : [...state.routeStops, { kind: 'account', id: accountId }];
    return {
      routeStops: nextStops,
      selectedAccountsForRoute: deriveAccountIds(nextStops),
    };
  }),

  toggleAroundMeForRoute: (result, prospectCategory) => set((state) => {
    const stopId = aroundMeStopId(result.id);
    const exists = state.routeStops.some((s) => s.id === stopId);
    const nextStops: RouteStop[] = exists
      ? state.routeStops.filter((s) => s.id !== stopId)
      : [
          ...state.routeStops,
          {
            kind: 'aroundMe',
            id: stopId,
            name: result.name,
            address: result.address,
            latitude: result.latitude,
            longitude: result.longitude,
            prospectCategory: prospectCategory || result.prospectCategory,
            category: result.category,
          },
        ];
    return {
      routeStops: nextStops,
      selectedAccountsForRoute: deriveAccountIds(nextStops),
    };
  }),

  isStopInRoute: (stopId) => get().routeStops.some((s) => s.id === stopId),

  reorderRouteStops: (fromIndex, toIndex) => set((state) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= state.routeStops.length ||
      toIndex >= state.routeStops.length
    ) {
      return {};
    }
    const next = state.routeStops.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return {
      routeStops: next,
      selectedAccountsForRoute: deriveAccountIds(next),
    };
  }),

  clearRouteSelection: () => set({ routeStops: [], selectedAccountsForRoute: [], loadedSavedRouteId: null }),

  loadRouteFromSnapshot: (stops) => set({
    routeStops: stops,
    selectedAccountsForRoute: deriveAccountIds(stops),
    isRouteModeActive: true,
    loadedSavedRouteId: null,
  }),

  loadedSavedRouteId: null,
  setLoadedSavedRouteId: (id) => set({ loadedSavedRouteId: id }),

  toggleSidebar: () => set((state) => ({
    isSidebarOpen: !state.isSidebarOpen
  })),

  setDrawerOpen: (open) => set({
    isDrawerOpen: open,
    selectedAccount: open ? get().selectedAccount : null,
  }),

  setMapView: (center, zoom) => set({ mapCenter: center, mapZoom: zoom }),

  updateAccountStatus: (accountId, status) => set((state) => ({
    accounts: state.accounts.map(account =>
      account.id === accountId ? { ...account, accountStatus: status } : account
    ),
    selectedAccount: state.selectedAccount?.id === accountId
      ? { ...state.selectedAccount, accountStatus: status }
      : state.selectedAccount,
  })),

  // Patches any subset of an account's fields in both the accounts list and
  // the currently open drawer's selectedAccount, so edits (e.g. the contact
  // record dialog) show up immediately instead of needing a page reload.
  updateAccountFields: (accountId, patch) => set((state) => ({
    accounts: state.accounts.map(account =>
      account.id === accountId ? { ...account, ...patch } : account
    ),
    selectedAccount: state.selectedAccount?.id === accountId
      ? { ...state.selectedAccount, ...patch }
      : state.selectedAccount,
  })),

  // NOTE: Optimistic local-only update. Source of truth is the DB; values
  // get reconciled on the next React Query refetch. The real persistence
  // happens via useLogVisit() / AccountDrawer.
  logVisit: (accountId, notes) => set((state) => {
    const now = new Date().toISOString().split('T')[0];
    const applyPatch = (account: Account) => ({
      ...account,
      visitCount: account.visitCount + 1,
      lastVisitDate: now,
      accountNotes: notes ? `${now}: ${notes}\n\n${account.accountNotes || ''}` : account.accountNotes,
    });
    return {
      accounts: state.accounts.map(account =>
        account.id === accountId ? applyPatch(account) : account
      ),
      selectedAccount: state.selectedAccount?.id === accountId
        ? applyPatch(state.selectedAccount)
        : state.selectedAccount,
    };
  }),

  setAccounts: (accounts) => set((state) => {
    // Only auto-enable filters on the FIRST load. After that, preserve the
    // user's selections so window-focus refetches don't wipe their filters.
    const isFirstLoad = state.accounts.length === 0;
    if (!isFirstLoad) return { accounts };

    const has = (pred: (a: typeof accounts[number]) => boolean) => accounts.some(pred);
    const hasService = (s: ServiceType) => has((a) => a.services.includes(s));
    return {
      accounts,
      statusFilters: {
        lead: has(a => a.accountStatus === 'lead'),
        active: has(a => a.accountStatus === 'active'),
        canceled: has(a => a.accountStatus === 'canceled'),
        new_customer: has(a => a.accountStatus === 'new_customer'),
      },
      serviceFilters: {
        buildingEngineering: hasService('buildingEngineering'),
        facilitySolutions: hasService('facilitySolutions'),
        janitorial: hasService('janitorial'),
        specialProjects: hasService('specialProjects'),
        landscape: hasService('landscape'),
        fullService: has(a => ALL_SERVICE_TYPES.every((s) => a.services.includes(s))),
      },
    };
  }),

  setUserLocation: (location) => set({ userLocation: location }),
}));

// Selector for filtered accounts — uses the advanced filter builder, then
// applies the map toolbar's sort (if any) on top.
export const useFilteredAccounts = () => {
  const accounts = useAppStore((s) => s.accounts);
  const advancedFilters = useAppStore((s) => s.advancedFilters);
  const mapSort = useAppStore((s) => s.mapSort);
  const filtered = accounts.filter((account) => evaluateFilters(account, advancedFilters));
  if (!mapSort) return filtered;

  const dir = mapSort.direction === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    switch (mapSort.column) {
      case 'accountName':
        return a.accountName.localeCompare(b.accountName) * dir;
      case 'status':
        return a.accountStatus.localeCompare(b.accountStatus) * dir;
      case 'city':
        return (a.routeCity ?? '').localeCompare(b.routeCity ?? '') * dir;
      case 'lastVisitDate': {
        const at = a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : 0;
        const bt = b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : 0;
        return (at - bt) * dir;
      }
    }
  });
};
