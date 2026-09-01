import { useMemo, useState } from 'react';
import { Search, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useAppStore } from '@/store/appStore';
import { useAllProspectContacts } from '@/hooks/useProspectContacts';
import type { ProspectContactWithAccount } from '@/hooks/useProspectContacts';
import { statusConfig, AccountStatus } from '@/types/account';
import { toast } from 'sonner';

function externalUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function toCsv(rows: { name: string; title: string; account: string; email: string; phone: string }[]): string {
  const header = ['Name', 'Title', 'Account', 'Email', 'Phone'];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.map(escape).join(',')];
  for (const r of rows) {
    lines.push([r.name, r.title, r.account, r.email, r.phone].map(escape).join(','));
  }
  return lines.join('\n');
}

// A saved contact enriched with the fields we need for filtering/sorting
// (status, city) that live on the account, not the contact row itself.
interface EnrichedContact extends ProspectContactWithAccount {
  accountStatus: AccountStatus | null;
  accountCity: string | null;
}

type SortColumn = 'name' | 'title' | 'account' | 'status' | 'email' | 'phone';
type SortDirection = 'asc' | 'desc';
interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

function getSortValue(c: EnrichedContact, column: SortColumn): string {
  switch (column) {
    case 'name': return `${c.first_name} ${c.last_name}`.toLowerCase();
    case 'title': return (c.title || '').toLowerCase();
    case 'account': return c.account_name.toLowerCase();
    case 'status': return (c.accountStatus ? statusConfig[c.accountStatus].label : '').toLowerCase();
    case 'email': return (c.email || '').toLowerCase();
    case 'phone': return (c.phone || '').toLowerCase();
    default: return '';
  }
}

function sortContacts(rows: EnrichedContact[], column: SortColumn, direction: SortDirection): EnrichedContact[] {
  const sorted = [...rows].sort((a, b) => {
    const aVal = getSortValue(a, column);
    const bVal = getSortValue(b, column);
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}

export default function ContactsView() {
  const { accounts, setActiveTab, setSelectedAccount, setDrawerOpen } = useAppStore();
  const { data: contacts = [], isLoading } = useAllProspectContacts();
  const [query, setQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [sort, setSort] = useState<SortState>({ column: null, direction: 'asc' });

  const enriched = useMemo<EnrichedContact[]>(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return contacts.map((c) => {
      const account = byId.get(c.account_id);
      return { ...c, accountStatus: account?.accountStatus ?? null, accountCity: account?.routeCity ?? null };
    });
  }, [contacts, accounts]);

  const cities = useMemo(() => {
    const set = new Set(enriched.map((c) => c.accountCity).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = enriched;
    if (q) {
      rows = rows.filter((c) => `${c.first_name} ${c.last_name} ${c.account_name}`.toLowerCase().includes(q));
    }
    if (cityFilter !== 'all') rows = rows.filter((c) => c.accountCity === cityFilter);
    if (statusFilter !== 'all') rows = rows.filter((c) => c.accountStatus === statusFilter);
    if (sort.column) rows = sortContacts(rows, sort.column, sort.direction);
    return rows;
  }, [enriched, query, cityFilter, statusFilter, sort]);

  const accountCount = useMemo(() => new Set(contacts.map((c) => c.account_id)).size, [contacts]);

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

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.info('No contacts to export.');
      return;
    }
    const csv = toCsv(filtered.map((c) => ({
      name: `${c.first_name} ${c.last_name}`,
      title: c.title || '',
      account: c.account_name,
      email: c.email || '',
      phone: c.phone || '',
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} contact${filtered.length === 1 ? '' : 's'}`);
  };

  const viewOnMap = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      toast.error('Account not found.');
      return;
    }
    setSelectedAccount(account);
    setDrawerOpen(true);
    setActiveTab('map');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved contacts by name or account…"
              className="pl-9"
            />
          </div>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-auto h-9 text-xs gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | AccountStatus)}>
            <SelectTrigger className="w-auto h-9 text-xs gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        <div className="text-xs font-mono tracking-wider text-muted-foreground uppercase">
          {filtered.length} of {contacts.length} contact{contacts.length === 1 ? '' : 's'} saved across {accountCount} account{accountCount === 1 ? '' : 's'}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            {contacts.length === 0
              ? 'No contacts saved yet. Find people in the Prospect tab (or an account\'s Find Contacts button) to add them here.'
              : 'No saved contacts match these filters.'}
          </p>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <SortableTh column="name">Name</SortableTh>
                <SortableTh column="title">Title</SortableTh>
                <SortableTh column="account">Account</SortableTh>
                <SortableTh column="status">Status</SortableTh>
                <SortableTh column="email">Email</SortableTh>
                <SortableTh column="phone">Mobile</SortableTh>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    {c.linkedin_url ? (
                      <a href={externalUrl(c.linkedin_url)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {c.first_name} {c.last_name}
                      </a>
                    ) : (
                      <>{c.first_name} {c.last_name}</>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{c.title || '—'}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{c.account_name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.accountStatus ? (
                      <span className={`status-badge ${statusConfig[c.accountStatus].bgClass}`}>
                        {statusConfig[c.accountStatus].label}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className={`whitespace-nowrap ${c.email ? '' : 'text-muted-foreground italic'}`}>{c.email || 'not revealed'}</TableCell>
                  <TableCell className={`whitespace-nowrap ${c.phone ? '' : 'text-muted-foreground italic'}`}>{c.phone || 'not revealed'}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <button
                      onClick={() => viewOnMap(c.account_id)}
                      className="text-xs border border-border rounded-md px-2 py-1 hover:bg-muted transition-colors"
                    >
                      View on map
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
