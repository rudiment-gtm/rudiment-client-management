// The "Companies" default view under Leads — the real accounts table, same
// data/columns as the Map's list view (MapListView.tsx), just inline rather
// than a modal and without the map-only concerns (route mode, Around Me).
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/appStore';
import {
  Account,
  ServiceType,
  statusConfig,
  serviceConfig,
  isFullService,
  FULL_SERVICE_CONFIG,
} from '@/types/account';
import { cn } from '@/lib/utils';

const DASH = '—';

type SortColumn = 'accountName' | 'status' | 'services' | 'address' | 'city' | 'state' | 'contactName' | 'jobTitle' | 'email';
type SortDirection = 'asc' | 'desc';

function getContactName(account: Account): string {
  const named = [account.firstName, account.lastName].filter(Boolean).join(' ');
  return named || account.primaryContact || account.secondaryContact || '';
}

function getServicesLabel(services: ServiceType[]): string {
  if (services.length === 0) return '';
  if (isFullService(services)) return FULL_SERVICE_CONFIG.label;
  return services.map((s) => serviceConfig[s]?.label ?? s).join(', ');
}

function getSortValue(a: Account, column: SortColumn): string {
  switch (column) {
    case 'accountName': return a.accountName;
    case 'status': return statusConfig[a.accountStatus]?.label ?? a.accountStatus ?? '';
    case 'services': return getServicesLabel(a.services);
    case 'address': return a.routeAddress || '';
    case 'city': return a.routeCity || '';
    case 'state': return a.routeState || '';
    case 'contactName': return getContactName(a);
    case 'jobTitle': return a.jobTitle || '';
    case 'email': return a.mainEmail || '';
    default: return '';
  }
}

function streetOf(full: string, city?: string) {
  if (!full) return '';
  if (city) {
    const idx = full.toLowerCase().indexOf(city.toLowerCase());
    if (idx > 0) return full.slice(0, idx).replace(/[, ]+$/, '');
  }
  return full.split(',')[0]?.trim() || full;
}

export default function LeadsAccountsTable() {
  const accounts = useAppStore((s) => s.accounts);
  const setSelectedAccount = useAppStore((s) => s.setSelectedAccount);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: SortColumn | null; direction: SortDirection }>({ column: null, direction: 'asc' });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = accounts;
    if (q) {
      rows = rows.filter((a) =>
        a.accountName.toLowerCase().includes(q) ||
        getContactName(a).toLowerCase().includes(q) ||
        (a.routeCity?.toLowerCase().includes(q)) ||
        (a.routeState?.toLowerCase().includes(q)) ||
        (a.mainEmail?.toLowerCase().includes(q)),
      );
    }
    if (sort.column) {
      const col = sort.column;
      rows = [...rows].sort((a, b) => {
        const av = getSortValue(a, col).toLowerCase();
        const bv = getSortValue(b, col).toLowerCase();
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
      if (sort.direction === 'desc') rows = rows.slice().reverse();
    }
    return rows;
  }, [accounts, query, sort]);

  const handleSort = (column: SortColumn) => {
    setSort((prev) => (prev.column === column
      ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: 'asc' }));
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sort.column !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sort.direction === 'asc' ? <ArrowUp className="ml-1 h-3 w-3 opacity-80" /> : <ArrowDown className="ml-1 h-3 w-3 opacity-80" />;
  };

  const SortableTh = ({ column, children }: { column: SortColumn; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort(column)}>
      <span className="inline-flex items-center">{children}<SortIcon column={column} /></span>
    </TableHead>
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border px-4 py-3 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">{filtered.length} of {accounts.length} companies</div>
          <div className="relative min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company, contact, city, email…"
              className={cn(
                'w-full h-9 pl-9 pr-9 rounded-lg bg-muted/50 border-0 text-sm',
                'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20',
              )}
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6">{query ? `No companies match "${query}".` : 'No accounts yet.'}</p>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <SortableTh column="accountName">Account Name</SortableTh>
                <SortableTh column="status">Status</SortableTh>
                <SortableTh column="services">Services</SortableTh>
                <SortableTh column="address">Address</SortableTh>
                <SortableTh column="city">City</SortableTh>
                <SortableTh column="state">State</SortableTh>
                <SortableTh column="contactName">Contact Name</SortableTh>
                <SortableTh column="jobTitle">Job Title</SortableTh>
                <SortableTh column="email">Email</SortableTh>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((account) => {
                const cfg = statusConfig[account.accountStatus] ?? { label: account.accountStatus ?? 'Unknown', color: '#6b7280' };
                const contactName = getContactName(account);
                const servicesLabel = getServicesLabel(account.services);
                return (
                  <TableRow key={account.id} className="cursor-pointer" onClick={() => setSelectedAccount(account)}>
                    <TableCell className="font-medium max-w-[260px] truncate text-primary" title={account.accountName}>
                      {account.accountName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" style={{ backgroundColor: cfg.color, color: 'white' }} className="text-xs">
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
                      ) : DASH}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={account.routeAddress}>
                      {streetOf(account.routeAddress || '', account.routeCity)}
                    </TableCell>
                    <TableCell>{account.routeCity || DASH}</TableCell>
                    <TableCell>{account.routeState || DASH}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={contactName}>{contactName || DASH}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={account.jobTitle}>{account.jobTitle || DASH}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {account.mainEmail ? (
                        <a href={`mailto:${account.mainEmail}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline" title={account.mainEmail}>
                          {account.mainEmail}
                        </a>
                      ) : DASH}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
