import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useAccounts } from '@/hooks/useAccounts';
import FilterSidebar from '@/components/FilterSidebar';
import ChatView from '@/components/ChatView';
import TasksView from '@/components/TasksView';
import MeetingsView from '@/components/MeetingsView';
import ProjectsView from '@/components/ProjectsView';
import DashboardView from '@/components/DashboardView';
import { cn } from '@/lib/utils';

const Index = () => {
  const { isSidebarOpen, setAccounts, accounts, activeTab } = useAppStore();
  const { data: dbAccounts, isLoading } = useAccounts();

  // Sync database accounts to store, fallback to mock data if empty
  useEffect(() => {
    console.log('[Index] DB accounts:', dbAccounts?.length, 'Store accounts:', accounts.length, 'Loading:', isLoading);
    if (!isLoading && dbAccounts) {
      setAccounts(dbAccounts);
    }
  }, [dbAccounts, isLoading, setAccounts]);

  return (
    <div className="h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <FilterSidebar />

      {/* Main Content */}
      <div className={cn(
        "h-full transition-all duration-300",
        isSidebarOpen ? "ml-0 md:ml-72" : "ml-0 md:ml-16"
      )}>
        {/* Chat tab */}
        {activeTab === 'chat' && (
          <div className="h-full">
            <ChatView />
          </div>
        )}

        {/* Meetings tab */}
        {activeTab === 'meetings' && (
          <div className="h-full">
            <MeetingsView />
          </div>
        )}

        {/* Projects tab */}
        {activeTab === 'projects' && (
          <div className="h-full">
            <ProjectsView />
          </div>
        )}

        {/* Tasks tab */}
        {activeTab === 'tasks' && (
          <div className="h-full">
            <TasksView />
          </div>
        )}

        {/* Client Dashboard tab */}
        {activeTab === 'dashboard' && (
          <div className="h-full">
            <DashboardView />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
