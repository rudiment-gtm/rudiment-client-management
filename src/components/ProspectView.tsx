import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, Loader2, Search } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/integrations/supabase/client';
import { useUpsertProspectContact } from '@/hooks/useProspectContacts';
import { useProspectPool, useCreateAccountFromPoolCompany } from '@/hooks/useProspectPool';
import type { PoolCompany } from '@/hooks/useProspectPool';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prospectCategoryLabels, ProspectCategory } from '@/types/account';
import ImportCsvButton from '@/components/ImportCsvButton';

interface Employee {
  firstName: string;
  lastName: string;
  title: string | null;
  linkedinUrl: string | null;
}

interface EmployeeState {
  loading?: boolean;
  notConfigured?: boolean;
  error?: boolean;
  employees?: Employee[];
}

const personKey = (e: Employee) => `${e.firstName}|${e.lastName}`;
const DASH = '—';

type SortColumn = 'company_name' | 'category' | 'city' | 'state';
type SortDirection = 'asc' | 'desc';
interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

function sortPool(rows: PoolCompany[], column: SortColumn, direction: SortDirection): PoolCompany[] {
  const sorted = [...rows].sort((a, b) => {
    const aVal = (a[column] || '').toLowerCase();
    const bVal = (b[column] || '').toLowerCase();
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}

export default function ProspectView() {
  const { setActiveTab, pendingPoolImport, setPendingPoolImport } = useAppStore();
  const { data: pool = [], isLoading: poolLoading } = useProspectPool();
  const upsertContact = useUpsertProspectContact();
  const createAccount = useCreateAccountFromPoolCompany();

  const [query, setQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProspectCategory>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [titleFilter, setTitleFilter] = useState('');
  const [employeesByCompany, setEmployeesByCompany] = useState<Record<string, EmployeeState>>({});
  const [selectedByCompany, setSelectedByCompany] = useState<Record<string, Record<string, boolean>>>({});
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{ ids: string[]; count: number } | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [sort, setSort] = useState<SortState>({ column: null, direction: 'asc' });

  // Picks up an import that was triggered from the Map view's list dialog
  // (rather than the button on this tab), so the review banner shows up
  // here regardless of where the import started.
  useEffect(() => {
    if (pendingPoolImport) {
      setImportSummary(pendingPoolImport);
      setPendingPoolImport(null);
    }
  }, [pendingPoolImport, setPendingPoolImport]);

  const cities = useMemo(() => {
    const set = new Set(pool.map((c) => c.city).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [pool]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = pool.filter((c) => {
      if (q && !`${c.company_name} ${c.city ?? ''}`.toLowerCase().includes(q)) return false;
      if (cityFilter !== 'all' && c.city !== cityFilter) return false;
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
      return true;
    });
    if (sort.column) rows = sortPool(rows, sort.column, sort.direction);
    return rows;
  }, [pool, query, cityFilter, categoryFilter, sort]);

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

  const toggleExpand = async (company: PoolCompany) => {
    const key = company.id;
    if (expandedId === key) {
      setExpandedId(null);
      return;
    }
    setExpandedId(key);
    setTitleFilter('');
    if (employeesByCompany[key]) return; // already fetched (or fetching)

    setEmployeesByCompany((s) => ({ ...s, [key]: { loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke('leadmagic-find-employees', {
        body: { companyName: company.company_name, website: company.website },
      });
      if (error) throw error;
      if (data?.notConfigured) {
        setEmployeesByCompany((s) => ({ ...s, [key]: { loading: false, notConfigured: true, employees: [] } }));
        return;
      }
      setEmployeesByCompany((s) => ({ ...s, [key]: { loading: false, employees: data?.employees || [] } }));
    } catch {
      setEmployeesByCompany((s) => ({ ...s, [key]: { loading: false, error: true, employees: [] } }));
    }
  };

  const toggleSelect = (companyId: string, employee: Employee) => {
    setSelectedByCompany((s) => {
      const current = { ...(s[companyId] || {}) };
      const k = personKey(employee);
      if (current[k]) delete current[k];
      else current[k] = true;
      return { ...s, [companyId]: current };
    });
  };

  const pushSelected = async (company: PoolCompany) => {
    const key = company.id;
    const selectedKeys = selectedByCompany[key] || {};
    const chosen = (employeesByCompany[key]?.employees || []).filter((e) => selectedKeys[personKey(e)]);
    if (!chosen.length) return;

    setPushingId(key);
    try {
      // A pool company has no account yet — create one (or find the existing
      // one if this company was already pushed once) before saving contacts.
      const account = await createAccount.mutateAsync(company);
      await Promise.all(chosen.map((e) => upsertContact.mutateAsync({
        accountId: account.id,
        firstName: e.firstName,
        lastName: e.lastName,
        patch: { title: e.title, linkedinUrl: e.linkedinUrl },
      })));
      toast.success(`Pushed ${chosen.length} contact${chosen.length === 1 ? '' : 's'} to ${account.accountName} — now on the map`);
      setSelectedByCompany((s) => ({ ...s, [key]: {} }));
      setActiveTab('map');
    } catch (e) {
      toast.error(`Could not push to map: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setPushingId(null);
    }
  };

  const handleImportAllToMap = async () => {
    if (!importSummary) return;
    const companies = pool.filter((c) => importSummary.ids.includes(c.id));
    setBulkImporting(true);
    try {
      for (const company of companies) {
        // eslint-disable-next-line no-await-in-loop
        await createAccount.mutateAsync(company);
      }
      toast.success(`Added ${companies.length} account${companies.length === 1 ? '' : 's'} to the map.`);
      setImportSummary(null);
    } catch (e) {
      toast.error(`Could not add all to map: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBulkImporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border px-4 py-3 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">
            {poolLoading ? 'Loading…' : `${filtered.length} of ${pool.length} compan${pool.length === 1 ? 'y' : 'ies'}`}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search companies by name or city…"
                className="pl-9 h-9"
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
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as 'all' | ProspectCategory)}>
              <SelectTrigger className="w-auto h-9 text-xs gap-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any category</SelectItem>
                {Object.entries(prospectCategoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ImportCsvButton onImported={(r) => setImportSummary(r)} className="h-9 px-3" />
          </div>
        </div>

        {importSummary && (
          <div className="glass-card p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm">
              {importSummary.count} compan{importSummary.count === 1 ? 'y' : 'ies'} imported into the prospect pool below.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleImportAllToMap}
                disabled={bulkImporting}
                className="btn-pill-primary text-xs px-3 py-1.5"
              >
                Import All to Map
              </button>
              <button
                onClick={() => setImportSummary(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
              >
                Just browse for now
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 && !poolLoading ? (
          <p className="text-sm text-muted-foreground p-6">No companies match these filters.</p>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <SortableTh column="company_name">Company Name</SortableTh>
                <SortableTh column="category">Category</SortableTh>
                <TableHead>Address</TableHead>
                <SortableTh column="city">City</SortableTh>
                <SortableTh column="state">State</SortableTh>
                <TableHead>Website</TableHead>
                <TableHead className="text-right">People</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((company) => {
                const key = company.id;
                const isOpen = expandedId === key;
                const employeeState = employeesByCompany[key];
                const employees = (employeeState?.employees || []).filter((e) =>
                  !titleFilter.trim() || (e.title || '').toLowerCase().includes(titleFilter.trim().toLowerCase())
                );
                const selectedCount = Object.keys(selectedByCompany[key] || {}).length;

                return (
                  <Fragment key={key}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpand(company)}>
                      <TableCell className="font-medium max-w-[220px] truncate" title={company.company_name}>
                        {company.company_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {company.category ? (prospectCategoryLabels[company.category as ProspectCategory] ?? company.category) : DASH}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={company.address ?? undefined}>
                        {company.address || DASH}
                      </TableCell>
                      <TableCell>{company.city || DASH}</TableCell>
                      <TableCell>{company.state || DASH}</TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        {company.website ? (
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline"
                          >
                            {company.website.replace(/^https?:\/\//i, '')}
                          </a>
                        ) : DASH}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {employeeState?.loading ? 'Searching…' : isOpen ? 'Hide' : employeeState ? 'View people' : 'Find people'}
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </span>
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="bg-muted/30 border-t border-border p-4">
                          <div className="space-y-3 max-w-2xl">
                            {employeeState?.loading && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching employees…
                              </div>
                            )}
                            {employeeState?.notConfigured && (
                              <p className="text-sm text-muted-foreground">Contact finder isn't connected yet — add a LEADMAGIC_API_KEY to enable it.</p>
                            )}
                            {employeeState?.error && (
                              <p className="text-sm text-muted-foreground">Couldn't reach LeadMagic. Try again in a moment.</p>
                            )}
                            {employeeState && !employeeState.loading && !employeeState.notConfigured && !employeeState.error && employeeState.employees?.length === 0 && (
                              <p className="text-sm text-muted-foreground">No employees found for this company.</p>
                            )}

                            {!!employeeState?.employees?.length && (
                              <>
                                <Input
                                  value={titleFilter}
                                  onChange={(e) => setTitleFilter(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Filter by job title (e.g. owner, manager)…"
                                  className="h-8 text-xs bg-background"
                                />
                                <div className="space-y-1.5">
                                  {employees.map((e, i) => {
                                    const checked = !!selectedByCompany[key]?.[personKey(e)];
                                    return (
                                      <div
                                        key={i}
                                        onClick={(ev) => { ev.stopPropagation(); toggleSelect(key, e); }}
                                        className="flex items-center gap-3 p-2 rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
                                      >
                                        <Checkbox checked={checked} onCheckedChange={() => toggleSelect(key, e)} onClick={(ev) => ev.stopPropagation()} />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm truncate">{e.firstName} {e.lastName}</p>
                                          {e.title && <p className="text-xs text-muted-foreground truncate">{e.title}</p>}
                                        </div>
                                        {e.linkedinUrl && (
                                          <a
                                            href={e.linkedinUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(ev) => ev.stopPropagation()}
                                            className="text-xs text-primary flex-shrink-0"
                                          >
                                            LinkedIn
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {employees.length === 0 && (
                                    <p className="text-sm text-muted-foreground">No employees match "{titleFilter}".</p>
                                  )}
                                </div>

                                {selectedCount > 0 && (
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); pushSelected(company); }}
                                    disabled={pushingId === key}
                                    className="btn-pill-primary w-full py-2 text-sm"
                                  >
                                    {pushingId === key ? 'Pushing…' : `Push ${selectedCount} to Map →`}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
