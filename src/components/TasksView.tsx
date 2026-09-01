import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useTasks, useCompleteTask, TaskWithAccount } from '@/hooks/useTasks';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';
import { format, isToday, isThisWeek, startOfDay } from 'date-fns';

type TaskTab = 'upcoming' | 'overdue' | 'done';

function groupTasks(tasks: TaskWithAccount[]) {
  const groups: { label: string; tasks: TaskWithAccount[] }[] = [
    { label: 'Today', tasks: [] },
    { label: 'This week', tasks: [] },
    { label: 'Later', tasks: [] },
  ];
  for (const t of tasks) {
    const due = new Date(t.due_at);
    if (isToday(due)) groups[0].tasks.push(t);
    else if (isThisWeek(due, { weekStartsOn: 1 })) groups[1].tasks.push(t);
    else groups[2].tasks.push(t);
  }
  return groups.filter((g) => g.tasks.length > 0);
}

export default function TasksView() {
  const { data: tasks = [], isLoading } = useTasks();
  const completeTask = useCompleteTask();
  const [tab, setTab] = useState<TaskTab>('upcoming');
  const { setSelectedAccount, accounts, setDrawerOpen, setActiveTab } = useAppStore();

  // Overdue means "before today," not "before this exact second" — a task
  // due at 1:25pm today shouldn't flip to Overdue at 1:25:01pm.
  const todayStart = startOfDay(new Date());
  const upcoming = tasks.filter((t) => t.status === 'upcoming' && new Date(t.due_at) >= todayStart);
  const overdue = tasks.filter((t) => t.status === 'upcoming' && new Date(t.due_at) < todayStart);
  const done = tasks.filter((t) => t.status === 'done');

  const visible = tab === 'upcoming' ? upcoming : tab === 'overdue' ? overdue : done;
  const groups = groupTasks(visible);
  const openCount = upcoming.length + overdue.length;

  const openAccount = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    setSelectedAccount(account);
    setDrawerOpen(true);
    setActiveTab('map');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 pt-6 pb-3 border-b">
        <div className="flex items-center gap-1">
          {([['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['done', 'Done']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{openCount} open task{openCount === 1 ? '' : 's'}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nothing here.</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</h3>
              <div className="space-y-1.5">
                {group.tasks.map((task) => (
                  <div key={task.id} className="glass-card p-3 flex items-start gap-3">
                    <Checkbox
                      checked={task.status === 'done'}
                      onCheckedChange={(checked) => completeTask.mutate({ id: task.id, done: !!checked })}
                      className="mt-0.5"
                    />
                    <button className="flex-1 min-w-0 text-left" onClick={() => openAccount(task.account_id)}>
                      <p className={cn('text-sm font-medium truncate', task.status === 'done' && 'line-through text-muted-foreground')}>
                        {task.title}
                      </p>
                      {task.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">
                          {task.subtitle} · {format(new Date(task.due_at), 'MMM d')}
                        </p>
                      )}
                    </button>
                    {task.owner && (
                      <span className="text-xs font-medium text-muted-foreground shrink-0">{task.owner}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
