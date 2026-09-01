import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CalendarDays,
  FolderKanban,
  Settings as SettingsIcon,
  ListChecks,
  LayoutDashboard,
} from 'lucide-react';
import { useState } from 'react';
import SettingsDialog from '@/components/SettingsDialog';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/AuthProvider';

const NAV_ITEMS = [
  { tab: 'chat', label: 'AI Agent Cue', icon: Sparkles },
  { tab: 'meetings', label: 'Meetings', icon: CalendarDays },
  { tab: 'projects', label: 'Projects', icon: FolderKanban },
  { tab: 'tasks', label: 'Tasks', icon: ListChecks },
  { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
] as const;

export default function FilterSidebar() {
  const { isSidebarOpen, toggleSidebar, activeTab, setActiveTab } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { profile } = useAuthContext();
  const trialDaysLeft = profile?.plan_tier === 'trial' && profile.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <>
      <aside
        className={cn(
          'fixed left-0 top-0 h-full z-40 transition-all duration-300 ease-in-out',
          'bg-sidebar text-sidebar-foreground shadow-xl',
          isSidebarOpen ? 'w-72' : 'w-0 -translate-x-full md:translate-x-0 md:w-16'
        )}
      >
        <div
          className={cn(
            'h-full flex flex-col overflow-hidden',
            isSidebarOpen ? 'opacity-100' : 'md:opacity-100 opacity-0'
          )}
        >
          {/* Header */}
          <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
            {isSidebarOpen ? (
              <>
                <div>
                  <p className="text-sm font-bold tracking-tight mb-1">Rudiment</p>
                  <p className="text-xs text-sidebar-muted">Ops tracker</p>
                </div>
                <button
                  onClick={toggleSidebar}
                  className="touch-button text-sidebar-muted hover:text-sidebar-foreground transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button
                onClick={toggleSidebar}
                className="touch-button mx-auto text-sidebar-muted hover:text-sidebar-foreground transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Primary navigation — icon + label rail. */}
          {isSidebarOpen && (
            <nav className="p-2 border-b border-sidebar-border space-y-0.5">
              {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    activeTab === tab
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          )}

          {/* Sidebar footer — settings */}
          {isSidebarOpen && (
            <div className="mt-auto p-4 border-t border-sidebar-border space-y-3">
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-full flex items-center gap-2.5 px-1 py-1 rounded-md text-sm text-sidebar-muted hover:text-sidebar-foreground transition-colors"
              >
                <SettingsIcon className="w-4 h-4" />
                Settings
              </button>
              {trialDaysLeft !== null && (
                <p className="text-[11px] text-center text-primary/80">
                  {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your trial` : 'Your trial has ended'}
                </p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile toggle button */}
      {!isSidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed left-4 top-4 z-50 md:hidden touch-button bg-sidebar text-sidebar-foreground rounded-lg shadow-lg"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
