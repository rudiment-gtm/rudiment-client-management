import { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Bold, Italic, List, ListOrdered, Heading1, Heading2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Meeting, useMeetings, useCreateMeeting, useUpdateMeeting, useDeleteMeeting } from '@/hooks/useMeetings';

const BODY_SAVE_DEBOUNCE_MS = 800;

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
  const bodyRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = meeting.content_html || '';
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  const commit = (patch: Partial<Pick<Meeting, 'title' | 'meeting_date' | 'attendees' | 'content_html'>>) =>
    updateMeeting.mutate({ id: meeting.id, patch });

  const saveBodyNow = () => {
    if (bodyRef.current) commit({ content_html: bodyRef.current.innerHTML });
  };

  const scheduleBodySave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveBodyNow, BODY_SAVE_DEBOUNCE_MS);
  };

  const exec = (command: string, value?: string) => {
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleBodySave();
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
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton title="Heading 1" onClick={() => exec('formatBlock', '<h1>')}><Heading1 className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton title="Heading 2" onClick={() => exec('formatBlock', '<h2>')}><Heading2 className="w-4 h-4" /></ToolbarButton>
      </div>

      <div className="flex-1 overflow-auto bg-muted/30">
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          onInput={scheduleBodySave}
          onBlur={saveBodyNow}
          data-placeholder="Start typing the agenda…"
          className={cn(
            'mx-auto my-8 max-w-3xl min-h-[65vh] rounded-md bg-background shadow-sm',
            'px-14 py-12 font-serif text-[15px] leading-relaxed text-foreground',
            'focus:outline-none',
            '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:font-sans',
            '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:font-sans',
            '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
            'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground',
          )}
        />
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
