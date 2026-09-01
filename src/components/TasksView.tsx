import { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format, isToday, isThisWeek, startOfDay, parseISO } from 'date-fns';
import { InternalTask, useTasks, useCreateTask, useCompleteTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';

type TaskTab = 'upcoming' | 'overdue' | 'done';

function groupTasks(tasks: InternalTask[]) {
  const groups: { label: string; tasks: InternalTask[] }[] = [
    { label: 'Today', tasks: [] },
    { label: 'This week', tasks: [] },
    { label: 'Later', tasks: [] },
  ];
  for (const t of tasks) {
    if (!t.due_date) {
      groups[2].tasks.push(t);
      continue;
    }
    const due = parseISO(t.due_date);
    if (isToday(due)) groups[0].tasks.push(t);
    else if (isThisWeek(due, { weekStartsOn: 1 })) groups[1].tasks.push(t);
    else groups[2].tasks.push(t);
  }
  return groups.filter((g) => g.tasks.length > 0);
}

function AddTaskForm({ onDone }: { onDone: () => void }) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [owner, setOwner] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    createTask.mutate(
      { title: title.trim(), due_date: dueDate || null, owner: owner || null },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="glass-card p-3 flex flex-col gap-2">
      <Input
        autoFocus
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <div className="flex items-center gap-2">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
        <Input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} className="flex-1" />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!title.trim()}>Add task</Button>
      </div>
    </div>
  );
}

function EditTaskForm({ task, onDone }: { task: InternalTask; onDone: () => void }) {
  const updateTask = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [owner, setOwner] = useState(task.owner ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ?? '');

  const save = () => {
    updateTask.mutate(
      { id: task.id, patch: { title: title.trim() || task.title, notes: notes || null, owner: owner || null, due_date: dueDate || null } },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="glass-card p-3 flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      <div className="flex items-center gap-2">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
        <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner (optional)" className="flex-1" />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
    </div>
  );
}

export default function TasksView() {
  const { data: tasks = [], isLoading } = useTasks();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const [tab, setTab] = useState<TaskTab>('upcoming');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Overdue means "before today," not "before this exact second" — a task
  // due at 1:25pm today shouldn't flip to Overdue at 1:25:01pm.
  const todayStart = startOfDay(new Date());
  const notDone = tasks.filter((t) => t.status !== 'Done');
  const upcoming = notDone.filter((t) => !t.due_date || parseISO(t.due_date) >= todayStart);
  const overdue = notDone.filter((t) => t.due_date && parseISO(t.due_date) < todayStart);
  const done = tasks.filter((t) => t.status === 'Done');

  const visible = tab === 'upcoming' ? upcoming : tab === 'overdue' ? overdue : done;
  const groups = groupTasks(visible);
  const openCount = upcoming.length + overdue.length;

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
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{openCount} open task{openCount === 1 ? '' : 's'}</span>
          <Button size="sm" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
            {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {adding ? 'Close' : 'Add task'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {adding && <AddTaskForm onDone={() => setAdding(false)} />}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nothing here.</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</h3>
              <div className="space-y-1.5">
                {group.tasks.map((task) =>
                  editingId === task.id ? (
                    <EditTaskForm key={task.id} task={task} onDone={() => setEditingId(null)} />
                  ) : (
                    <div key={task.id} className="glass-card p-3 flex items-start gap-3 group">
                      <Checkbox
                        checked={task.status === 'Done'}
                        onCheckedChange={(checked) => completeTask.mutate({ id: task.id, done: !!checked })}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium truncate', task.status === 'Done' && 'line-through text-muted-foreground')}>
                          {task.title}
                        </p>
                        {(task.notes || task.due_date) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {[task.notes, task.due_date ? format(parseISO(task.due_date), 'MMM d') : null].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      {task.owner && (
                        <span className="text-xs font-medium text-muted-foreground shrink-0">{task.owner}</span>
                      )}
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                        <button onClick={() => setEditingId(task.id)} className="text-muted-foreground hover:text-foreground" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteTask.mutate(task.id)} className="text-muted-foreground hover:text-destructive" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
