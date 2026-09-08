import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, FileText, ClipboardList, Link as LinkIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useFiles, useCreateFile, useDeleteFile } from '@/hooks/useFiles';
import { FileRecord, FileCategory, FILE_CATEGORY_LABELS } from '@/types/file';
import { INTAKE_SECTIONS } from '@/types/intake';

const CATEGORY_BADGE: Record<FileCategory, string> = {
  onboarding_intake: 'bg-primary/15 text-primary border-primary/30',
  lead_list: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  copy: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  other: 'bg-muted text-muted-foreground border-transparent',
};

function formatDate(iso: string) {
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

function IntakeDetail({ file }: { file: FileRecord }) {
  const data = (file.intake_data ?? {}) as Record<string, string>;
  return (
    <div className="space-y-6">
      {INTAKE_SECTIONS.map((section) => (
        <div key={section.id} className="space-y-2">
          <h4 className="text-sm font-semibold text-primary">{section.title}</h4>
          <div className="space-y-2">
            {section.fields.map((field) => {
              if (field.type === 'heading') {
                return <p key={field.id} className="text-xs font-semibold text-muted-foreground pt-1">{field.label}</p>;
              }
              const value = data[field.id];
              if (!value) return null;
              return (
                <div key={field.id} className="text-sm">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className="whitespace-pre-wrap">{value}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddFileForm({ onDone }: { onDone: () => void }) {
  const createFile = useCreateFile();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FileCategory>('lead_list');
  const [content, setContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    createFile.mutate(
      { title: title.trim(), category, content: content || null, link_url: linkUrl || null },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Input autoFocus placeholder="Title (e.g. Q3 lead list, homepage copy draft)" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1" />
        <Select value={category} onValueChange={(v) => setCategory(v as FileCategory)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['lead_list', 'copy', 'other'] as FileCategory[]).map((c) => (
              <SelectItem key={c} value={c}>{FILE_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea placeholder="Paste content here (a lead list, copy draft, notes)…" value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[100px]" />
      <Input placeholder="Or a link instead (Google Sheet, Doc, etc.) — optional" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
      <div className="flex items-center gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!title.trim() || createFile.isPending}>
          {createFile.isPending ? 'Saving…' : 'Add file'}
        </Button>
      </div>
    </div>
  );
}

function FileCard({ file }: { file: FileRecord }) {
  const [expanded, setExpanded] = useState(false);
  const deleteFile = useDeleteFile();
  const Icon = file.category === 'onboarding_intake' ? ClipboardList : file.link_url ? LinkIcon : FileText;

  return (
    <div className="glass-card overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-start gap-3 p-4 text-left">
        <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{file.title}</p>
            <Badge variant="outline" className={cn('text-[10px]', CATEGORY_BADGE[file.category])}>
              {FILE_CATEGORY_LABELS[file.category]}
            </Badge>
          </div>
          {file.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{file.description}</p>}
          <p className="text-[11px] text-muted-foreground mt-1">{formatDate(file.created_at)}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete "${file.title}"?`)) deleteFile.mutate(file.id);
          }}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {file.category === 'onboarding_intake' ? (
            <IntakeDetail file={file} />
          ) : (
            <div className="space-y-2 text-sm">
              {file.link_url && (
                <a href={file.link_url} target="_blank" rel="noreferrer" className="text-primary underline break-all">
                  {file.link_url}
                </a>
              )}
              {file.content && <p className="whitespace-pre-wrap">{file.content}</p>}
              {!file.link_url && !file.content && <p className="text-muted-foreground italic">No content.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilesView() {
  const { data: files = [], isLoading } = useFiles();
  const [adding, setAdding] = useState(false);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 pt-6 pb-3 border-b">
        <div>
          <h2 className="text-lg font-bold">Files</h2>
          <p className="text-xs text-muted-foreground">Onboarding intake, lead lists, and copy for review</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
          {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {adding ? 'Close' : 'Add file'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 max-w-3xl mx-auto w-full">
        {adding && <AddFileForm onDone={() => setAdding(false)} />}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            Nothing here yet — files show up once the onboarding form is submitted, or add one directly.
          </p>
        ) : (
          files.map((file) => <FileCard key={file.id} file={file} />)
        )}
      </div>
    </div>
  );
}
