import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Account,
  ServiceType,
  statusConfig,
  serviceConfig,
  isFullService,
  FULL_SERVICE_CONFIG,
  prospectCategoryLabels,
} from '@/types/account';
import type { AroundMeResult } from '@/lib/aroundMeSearch';
import { useAppStore } from '@/store/appStore';
import { MapPin, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Route, Navigation, Trash2, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import RouteOverviewDialog from '@/components/RouteOverviewDialog';
import { openGoogleMapsRoute, MAX_GOOGLE_MAPS_STOPS } from '@/lib/googleMapsRoute';
import AdvancedFilterPanel from '@/components/filters/AdvancedFilterPanel';
import { evaluateFilters } from '@/lib/filterEvaluator';
import { toast } from 'sonner';
import ImportCsvButton from '@/components/ImportCsvButton';

interface MapListViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  allAccounts: Account[];
  aroundMeItems: AroundMeResult[];
}

type SortColumn =
  | 'accountName'
  | 'status'
  | 'services'
  | 'address'
  | 'city'
  | 'state'
  | 'contactName'
  | 'jobTitle'
  | 'email'
  | 'phone'
  | 'lastContactedAt';

type SortDirection = 'asc' | 'desc';

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

const DASH = '—';

function getContactName(account: Account): string {
  const named = [account.firstName, account.lastName].filter(Boolean).join(' ');
  return named || account.primaryContact || account.secondaryContact || '';
}

function getServicesLabel(services: ServiceType[]): string {
  if (services.length === 0) return '';
  if (isFullService(services)) return FULL_SERVICE_CONFIG.label;
  return services.map((s) => serviceConfig[s]?.label ?? s).join(', ');
}

function getSortValue(row: Account | AroundMeResult, column: SortColumn): string | number {
  const isAccount = 'accountName' in row;

  switch (column) {
    case 'accountName':
      return isAccount ? (row as Account).accountName : (row as AroundMeResult).name;
    case 'status': {
      if (isAccount) {
        const status = (row as Account).accountStatus;
        return statusConfig[status]?.label ?? status ?? '';
      }
      return 'Around Me';
    }
    case 'services':
      return isAccount
        ? getServicesLabel((row as Account).services)
        : prospectCategoryLabels[(row as AroundMeResult).prospectCategory];
    case 'address':
      return isAccount ? ((row as Account).routeAddress || '') : (row as AroundMeResult).address;
    case 'city':
      return isAccount ? ((row as Account).routeCity || '') : '';
    case 'state':
      return isAccount ? ((row as Account).routeState || '') : '';
    case 'contactName':
      return isAccount ? getContactName(row as Account) : '';
    case 'jobTitle':
      return isAccount ? ((row as Account).jobTitle || '') : '';
    case 'email':
      return isAccount ? ((row as Account).mainEmail || '') : '';
    case 'phone':
      return isAccount ? ((row as Account).mainPhone || '') : '';
    case 'lastContactedAt': {
      if (!isAccount) return -Infinity;
      const v = (row as Account).lastContactedAt;
      if (!v) return -Infinity; // nulls sort last on desc, first on asc
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    }
    default:
      return '';
  }
}

function sortRows(
  rows: (Account | AroundMeResult)[],
  column: SortColumn,
  direction: SortDirection,
): (Account | AroundMeResult)[] {
  const sorted = [...rows].sort((a, b) => {
    const aVal = getSortValue(a, column);
    const bVal = getSortValue(b, column);

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return aVal - bVal;
    }

    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();

    if (aStr < bStr) return -1;
    if (aStr > bStr) return 1;
    return 0;
  });

  return direction === 'asc' ? sorted : sorted.reverse();
}

export default function MapListView({ open, onOpenChange, accounts, allAccounts, aroundMeItems }: MapListViewProps) {
  const {
    setSelectedAccount,
    isRouteModeActive,
    toggleRouteMode,
    routeStops,
    toggleAccountForRoute,
    toggleAroundMeForRoute,
    clearRouteSelection,
    accounts: storeAccounts,
    userLocation,
    listAdvancedFilters,
    clearListAdvancedFilters,
    setActiveTab,
    setPendingPoolImport,
  } = useAppStore();

  const handleImported = (result: { ids: string[]; count: number }) => {
    setPendingPoolImport(result);
    setActiveTab('leads');
    onOpenChange(false);
  };

  const listFilterCount = listAdvancedFilters.reduce((sum, g) => sum + g.conditions.length, 0);
  const hasListFilters = listFilterCount > 0;

  const handleOpenChange = (next: boolean) => {
    if (!next) clearListAdvancedFilters();
    onOpenChange(next);
  };


  const accountStopIndex = (id: string): number | undefined => {
    const i = routeStops.findIndex((s) => s.kind === 'account' && s.id === id);
    return i === -1 ? undefined : i;
  };
  const aroundMeStopIndex = (id: string): number | undefined => {
    const wrapped = `am:${id}`;
    const i = routeStops.findIndex((s) => s.kind === 'aroundMe' && s.id === wrapped);
    return i === -1 ? undefined : i;
  };
  const [sort, setSort] = useState<SortState>({ column: null, direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');
  const total = accounts.length + aroundMeItems.length;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  // When searching, search across all accounts in the database. Otherwise, only show records in the current view.
  const accountsSource = isSearching ? allAccounts : accounts;

  const searchedAccounts = useMemo(() => {
    if (!isSearching) return accountsSource;
    return accountsSource.filter((l) =>
      l.accountName.toLowerCase().includes(normalizedQuery) ||
      (getContactName(l).toLowerCase().includes(normalizedQuery)) ||
      (l.routeCity?.toLowerCase().includes(normalizedQuery)) ||
      (l.routeState?.toLowerCase().includes(normalizedQuery)) ||
      (l.mainEmail?.toLowerCase().includes(normalizedQuery)) ||
      (l.mainPhone?.includes(normalizedQuery)) ||
      (l.routeAddress?.toLowerCase().includes(normalizedQuery))
    );
  }, [accountsSource, normalizedQuery, isSearching]);

  const filteredAccounts = useMemo(() => {
    if (!hasListFilters) return searchedAccounts;
    return searchedAccounts.filter((l) => evaluateFilters(l, listAdvancedFilters));
  }, [searchedAccounts, listAdvancedFilters, hasListFilters]);

  const filteredAroundMe = useMemo(() => {
    // Hide Around Me items when list filters are active — they don't share the same schema.
    if (hasListFilters) return [];
    if (!isSearching) return aroundMeItems;
    return aroundMeItems.filter((r) =>
      r.name.toLowerCase().includes(normalizedQuery) ||
      (r.address?.toLowerCase().includes(normalizedQuery))
    );
  }, [aroundMeItems, normalizedQuery, isSearching, hasListFilters]);

  const filteredTotal = filteredAccounts.length + filteredAroundMe.length;


  const allRows = useMemo(() => {
    const combined: (Account | AroundMeResult)[] = [...filteredAccounts, ...filteredAroundMe];
    if (!sort.column) return combined;
    return sortRows(combined, sort.column, sort.direction);
  }, [filteredAccounts, filteredAroundMe, sort]);

  const handleSort = (column: SortColumn) => {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sort.column !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    if (sort.direction === 'asc') return <ArrowUp className="ml-1 h-3 w-3 opacity-80" />;
    return <ArrowDown className="ml-1 h-3 w-3 opacity-80" />;
  };

  const SortableHeader = ({
    column,
    children,
  }: {
    column: SortColumn;
    children: React.ReactNode;
  }) => (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => handleSort(column)}
    >
      <span className="inline-flex items-center">
        {children}
        <SortIcon column={column} />
      </span>
    </TableHead>
  );

  const handleAccountClick = (account: Account) => {
    if (isRouteModeActive) {
      toggleAccountForRoute(account.id);
      return;
    }
    setSelectedAccount(account);
    onOpenChange(false);
  };

  const handleAroundMeClick = (item: AroundMeResult) => {
    if (isRouteModeActive) {
      toggleAroundMeForRoute(item, item.prospectCategory);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('centerOnAccount', {
        detail: { latitude: item.latitude, longitude: item.longitude },
      })
    );
    onOpenChange(false);
  };

  const handleAccountNameClick = (account: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRouteModeActive) {
      toggleAccountForRoute(account.id);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('previewAccount', {
        detail: { id: account.id, latitude: account.latitude, longitude: account.longitude },
      })
    );
    onOpenChange(false);
  };

  const handleAroundMeNameClick = (item: AroundMeResult, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRouteModeActive) {
      toggleAroundMeForRoute(item, item.prospectCategory);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('centerOnAccount', {
        detail: { latitude: item.latitude, longitude: item.longitude },
      })
    );
    onOpenChange(false);
  };


  const streetOf = (full: string, city?: string) => {
    if (!full) return '';
    if (city) {
      const idx = full.toLowerCase().indexOf(city.toLowerCase());
      if (idx > 0) return full.slice(0, idx).replace(/[, ]+$/, '');
    }
    const parts = full.split(',');
    return parts[0]?.trim() || full;
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const renderRow = (row: Account | AroundMeResult) => {
    const isAccount = 'accountName' in row;

    if (isAccount) {
      const account = row as Account;
      const cfg = statusConfig[account.accountStatus] ?? { label: account.accountStatus ?? 'Unknown', color: '#6b7280' };
      const stopIdx = accountStopIndex(account.id);
      const inRoute = stopIdx !== undefined;
      const contactName = getContactName(account);
      const servicesLabel = getServicesLabel(account.services);
      return (
        <TableRow
          key={account.id}
          className={cn('cursor-pointer', inRoute && 'bg-primary/10 hover:bg-primary/15')}
          onClick={() => handleAccountClick(account)}
        >
          <TableCell className="font-medium max-w-[260px] truncate" title={account.accountName}>
            <div className="flex items-center gap-2 min-w-0">
              {isRouteModeActive && (
                <RouteStopMarker index={stopIdx} />
              )}
              <button
                type="button"
                onClick={(e) => handleAccountNameClick(account, e)}
                className="text-primary hover:underline font-medium text-left truncate max-w-full"
              >
                {account.accountName}
              </button>
            </div>
          </TableCell>

          <TableCell>
            <Badge
              variant="secondary"
              style={{ backgroundColor: cfg.color, color: 'white' }}
              className="text-xs"
            >
              {cfg.label}
            </Badge>
          </TableCell>
          <TableCell>
            {servicesLabel ? (
              <Badge
                variant="outline"
                className="text-xs"
                style={isFullService(account.services) ? { borderColor: FULL_SERVICE_CONFIG.color, color: FULL_SERVICE_CONFIG.color } : undefined}
              >
                {servicesLabel}
              </Badge>
            ) : (
              DASH
            )}
          </TableCell>
          <TableCell className="max-w-[220px] truncate" title={account.routeAddress}>
            {streetOf(account.routeAddress || '', account.routeCity)}
          </TableCell>
          <TableCell>{account.routeCity || DASH}</TableCell>
          <TableCell>{account.routeState || DASH}</TableCell>
          <TableCell className="max-w-[180px] truncate" title={contactName}>
            {contactName || DASH}
          </TableCell>
          <TableCell className="max-w-[180px] truncate" title={account.jobTitle}>
            {account.jobTitle || DASH}
          </TableCell>
          <TableCell className="max-w-[200px] truncate">
            {account.mainEmail ? (
              <a
                href={`mailto:${account.mainEmail}`}
                onClick={stop}
                className="text-primary hover:underline"
                title={account.mainEmail}
              >
                {account.mainEmail}
              </a>
            ) : (
              DASH
            )}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {account.mainPhone ? (
              <a
                href={`tel:${account.mainPhone}`}
                onClick={stop}
                className="text-primary hover:underline"
              >
                {account.mainPhone}
              </a>
            ) : (
              DASH
            )}
          </TableCell>
          <TableCell className="whitespace-nowrap text-muted-foreground">
            {account.lastContactedAt
              ? new Date(account.lastContactedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              : DASH}
          </TableCell>
        </TableRow>
      );
    }

    const item = row as AroundMeResult;
    const amIdx = aroundMeStopIndex(item.id);
    const amInRoute = amIdx !== undefined;
    return (
      <TableRow
        key={item.id}
        className={cn('cursor-pointer', amInRoute && 'bg-primary/10 hover:bg-primary/15')}
        onClick={() => handleAroundMeClick(item)}
      >
        <TableCell className="font-medium max-w-[260px] truncate" title={item.name}>
          <div className="flex items-center gap-2 min-w-0">
            {isRouteModeActive && <RouteStopMarker index={amIdx} />}
            <button
              type="button"
              onClick={(e) => handleAroundMeNameClick(item, e)}
              className="text-primary hover:underline font-medium text-left truncate max-w-full"
            >
              {item.name}
            </button>
          </div>
        </TableCell>

        <TableCell>
          <Badge variant="secondary" className="text-xs bg-pink-500 text-white">
            Around Me
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {prospectCategoryLabels[item.prospectCategory]}
          </Badge>
        </TableCell>
        <TableCell className="max-w-[220px] truncate" title={item.address}>
          {streetOf(item.address)}
        </TableCell>
        <TableCell>{DASH}</TableCell>
        <TableCell>{DASH}</TableCell>
        <TableCell>{DASH}</TableCell>
        <TableCell>{DASH}</TableCell>
        <TableCell>{DASH}</TableCell>
        <TableCell>{DASH}</TableCell>
        <TableCell>{DASH}</TableCell>
      </TableRow>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>

      <DialogContent className="max-w-full w-screen h-screen sm:max-w-full sm:rounded-none p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0 space-y-3">
          <DialogTitle>
            {isSearching
              ? `Showing ${filteredTotal} of ${allAccounts.length} record${allAccounts.length !== 1 ? 's' : ''}`
              : `Showing ${total} record${total !== 1 ? 's' : ''} in current view`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Browse, search, and plan a route across your accounts in a tabular view.
          </DialogDescription>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search company, contact, city, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full h-10 pl-10 pr-10 rounded-lg",
                  "bg-muted/50 border-0",
                  "text-sm placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20",
                  "transition-all"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <ImportCsvButton onImported={handleImported} className="h-9 px-3" />

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filters
                    {hasListFilters && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                        {listFilterCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-3 bg-sidebar text-sidebar-foreground border-sidebar-border">
                  <AdvancedFilterPanel scope="list" />
                </PopoverContent>
              </Popover>

              {!isRouteModeActive ? (
                <Button onClick={toggleRouteMode} size="sm" className="gap-2">
                  <Route className="w-4 h-4" />
                  Plan Route
                </Button>
              ) : (

                <>
                  <span className="text-xs font-medium px-2 py-1 rounded-md bg-primary/10 text-primary">
                    {routeStops.length} stop{routeStops.length !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearRouteSelection}
                    disabled={routeStops.length === 0}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </Button>
                  <div className={cn(routeStops.length === 0 && 'pointer-events-none opacity-50')}>
                    <RouteOverviewDialog />
                  </div>
                  <Button
                    onClick={() => {
                      const { truncated } = openGoogleMapsRoute(routeStops, storeAccounts, userLocation);
                      if (truncated) {
                        toast.warning(`Google Maps supports up to ${MAX_GOOGLE_MAPS_STOPS} stops per route — extra stops were dropped.`);
                      }
                    }}
                    disabled={routeStops.length === 0}
                    size="sm"
                    className="gap-2 bg-status-active hover:bg-status-active/90"
                  >
                    <Navigation className="w-4 h-4" />
                    Start Navigation
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleRouteMode}
                    title="Exit route mode"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {filteredTotal === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-2">
              <MapPin className="w-8 h-8 opacity-50" />
              <p>{normalizedQuery ? `No records match "${searchQuery}".` : 'No records visible in this area.'}</p>
              <p className="text-sm">{normalizedQuery ? 'Try a different search term.' : 'Zoom out or pan to see more.'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  <SortableHeader column="accountName">Account Name</SortableHeader>
                  <SortableHeader column="status">Status</SortableHeader>
                  <SortableHeader column="services">Services</SortableHeader>
                  <SortableHeader column="address">Address</SortableHeader>
                  <SortableHeader column="city">City</SortableHeader>
                  <SortableHeader column="state">State</SortableHeader>
                  <SortableHeader column="contactName">Contact Name</SortableHeader>
                  <SortableHeader column="jobTitle">Job Title</SortableHeader>
                  <SortableHeader column="email">Email</SortableHeader>
                  <SortableHeader column="phone">Phone</SortableHeader>
                  <SortableHeader column="lastContactedAt">Last Contacted</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>{allRows.map(renderRow)}</TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RouteStopMarker({ index }: { index: number | undefined }) {
  if (index === undefined) {
    return (
      <span className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/40 shrink-0" />
    );
  }
  return (
    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
      {index + 1}
    </span>
  );
}
