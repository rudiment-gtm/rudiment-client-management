import { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Bold, Italic, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Meeting, useMeetings, useCreateMeeting, useUpdateMeeting, useDeleteMeeting } from '@/hooks/useMeetings';

const BODY_SAVE_DEBOUNCE_MS = 800;

type SectionKey = 'performance_html' | 'active_week_html' | 'in_progress_html' | 'notes_html';

const SECTIONS: { key: SectionKey; label: string; placeholder: string }[] = [
  { key: 'performance_html', label: 'Performance', placeholder: 'How are things trending — opens, replies, meetings booked…' },
  { key: 'active_week_html', label: 'Active this week', placeholder: "What's actively running right now…" },
  { key: 'in_progress_html', label: 'In progress', placeholder: "What's being built but not live yet…" },
  { key: 'notes_html', label: 'Notes', placeholder: 'Anything else worth writing down…' },
];

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      // Body loses focus (mousedown) before the command fires — prevent
      // default so execCommand still applies to the doc's current selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </button>
  );
}

function MeetingDocument({ meeting, onDeleted }: { meeting: Meeting; onDeleted: () => void }) {
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();

  const [title, setTitle] = useState(meeting.title);
  const [date, setDate] = useState(meeting.meeting_date);
  const [attendees, setAttendees] = useState(meeting.attendees ?? '');
  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({
    performance_html: null,
    active_week_html: null,
    in_progress_html: null,
    notes_html: null,
  });
  const focusedSection = useRef<SectionKey>('performance_html');
  const saveTimers = useRef<Partial<Record<SectionKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    for (const { key } of SECTIONS) {
      const el = sectionRefs.current[key];
      if (el) el.innerHTML = meeting[key] || '';
    }
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((t) => t && clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  const commit = (patch: Partial<Pick<Meeting, 'title' | 'meeting_date' | 'attendees' | SectionKey>>) =>
    updateMeeting.mutate({ id: meeting.id, patch });

  const saveSectionNow = (key: SectionKey) => {
    const el = sectionRefs.current[key];
    if (el) commit({ [key]: el.innerHTML } as Partial<Pick<Meeting, SectionKey>>);
  };

  const scheduleSectionSave = (key: SectionKey) => {
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => saveSectionNow(key), BODY_SAVE_DEBOUNCE_MS);
  };

  const exec = (command: string, value?: string) => {
    const el = sectionRefs.current[focusedSection.current];
    el?.focus();
    document.execCommand(command, false, value);
    scheduleSectionSave(focusedSection.current);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${meeting.title || 'this meeting'}"? This can't be undone.`)) {
      deleteMeeting.mutate(meeting.id);
      onDeleted();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-10 pt-8 pb-4 border-b space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== meeting.title) commit({ title: title.trim() || 'Untitled meeting' });
            }}
            placeholder="Untitled meeting"
            className="text-2xl font-bold bg-transparent border-none outline-none focus:ring-0 w-full p-0"
          />
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => {
              if (date !== meeting.meeting_date) commit({ meeting_date: date });
            }}
            className="h-8 w-40 text-sm"
          />
          <Input
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            onBlur={() => {
              if (attendees !== (meeting.attendees ?? '')) commit({ attendees: attendees || null });
            }}
            placeholder="Attendees (comma separated)"
            className="h-8 flex-1 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 border-b px-6 py-1.5 shrink-0 bg-background sticky top-0 z-10">
        <ToolbarButton title="Bold" onClick={() => exec('bold')}><Bold className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => exec('italic')}><Italic className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton title="Bulleted list" onClick={() => exec('insertUnorderedList')}><List className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered className="w-4 h-4" /></ToolbarButton>
      </div>

      <div className="flex-1 overflow-auto bg-muted/30">
        <div className="mx-auto my-8 max-w-3xl rounded-md bg-background shadow-sm px-14 py-12">
          {SECTIONS.map(({ key, label, placeholder }, i) => (
            <div key={key} className={cn(i > 0 && 'mt-8 pt-8 border-t')}>
              <h2 className="text-lg font-bold font-sans mb-3">{label}</h2>
              <div
                ref={(el) => { sectionRefs.current[key] = el; }}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => { focusedSection.current = key; }}
                onInput={() => scheduleSectionSave(key)}
                onBlur={() => saveSectionNow(key)}
                data-placeholder={placeholder}
                className={cn(
                  'min-h-[80px] font-serif text-[15px] leading-relaxed text-foreground',
                  'focus:outline-none',
                  '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
                  'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground',
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MeetingsView() {
  const { data: meetings = [], isLoading } = useMeetings();
  const createMeeting = useCreateMeeting();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = meetings.find((m) => m.id === selectedId) ?? null;

  const handleNew = () => {
    createMeeting.mutate(undefined, {
      onSuccess: (meeting) => setSelectedId(meeting.id),
    });
  };

  return (
    <div className="h-full flex bg-background">
      <div className="w-72 shrink-0 border-r flex flex-col h-full">
        <div className="p-4 border-b">
          <Button size="sm" className="w-full gap-1.5" onClick={handleNew}>
            <Plus className="w-4 h-4" />
            New meeting
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4">No meetings yet.</p>
          ) : (
            meetings.map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => setSelectedId(meeting.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b transition-colors',
                  selectedId === meeting.id ? 'bg-primary/10' : 'hover:bg-muted/50',
                )}
              >
                <p className="text-sm font-medium truncate">{meeting.title || 'Untitled meeting'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(() => {
                    try {
                      return format(parseISO(meeting.meeting_date), 'MMM d, yyyy');
                    } catch {
                      return meeting.meeting_date;
                    }
                  })()}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 h-full">
        {selected ? (
          <MeetingDocument key={selected.id} meeting={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Select a meeting, or start a new one.
          </div>
        )}
      </div>
    </div>
  );
}
