// Companies defaults to the real accounts table (same data as the Map),
// with a toggle to the prospect pool (CSV imports not yet promoted to
// accounts, with the LeadMagic employee-finder push-to-map flow) — that's a
// genuinely different grain of data, not replaced, just no longer the
// default view since it's usually empty until a CSV is imported.
// People (prospect_contacts, linked to a real account) is untouched.
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import LeadsAccountsTable from '@/components/LeadsAccountsTable';
import ProspectView from '@/components/ProspectView';
import ContactsView from '@/components/ContactsView';

type LeadsTab = 'companies' | 'people';
type CompaniesSource = 'accounts' | 'pool';

export default function LeadsView() {
  const [tab, setTab] = useState<LeadsTab>('companies');
  // Default to Prospect Pool when a CSV import just landed here (from the
  // Map's import flow) so the review banner is visible immediately, not
  // hidden behind a toggle the user hasn't clicked yet.
  const [companiesSource, setCompaniesSource] = useState<CompaniesSource>(
    () => (useAppStore.getState().pendingPoolImport ? 'pool' : 'accounts'),
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 border-b">
        <div className="flex items-center gap-1">
          {([
            { value: 'companies', label: 'Companies' },
            { value: 'people', label: 'People' },
          ] as { value: LeadsTab; label: string }[]).map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'companies' && (
          <div className="flex items-center gap-1 pb-2">
            {([
              { value: 'accounts', label: 'Accounts' },
              { value: 'pool', label: 'Prospect Pool' },
            ] as { value: CompaniesSource; label: string }[]).map((s) => (
              <button
                key={s.value}
                onClick={() => setCompaniesSource(s.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  companiesSource === s.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'people' ? (
          <ContactsView />
        ) : companiesSource === 'accounts' ? (
          <LeadsAccountsTable />
        ) : (
          <ProspectView />
        )}
      </div>
    </div>
  );
}
