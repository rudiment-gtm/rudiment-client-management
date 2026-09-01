import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import {
  useTags,
  useCreateTag,
  useAccountTags,
  useAddTagToAccount,
  useRemoveTagFromAccount,
} from '@/hooks/useTags';
import { cn } from '@/lib/utils';

const TAG_COLORS = [
  '#00F0B5', '#4FC3F7', '#FBBF24', '#FF5C5C',
  '#A78BFA', '#F472B6', '#34D399', '#94A3B8',
];

interface AccountTagsEditorProps {
  accountId: string;
}

export default function AccountTagsEditor({ accountId }: AccountTagsEditorProps) {
  const { data: allTags = [] } = useTags();
  const { data: accountTagIds = [] } = useAccountTags(accountId);
  const createTag = useCreateTag();
  const addTag = useAddTagToAccount();
  const removeTag = useRemoveTagFromAccount();

  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);

  const accountTags = allTags.filter((t) => accountTagIds.includes(t.id));
  const availableTags = allTags.filter((t) => !accountTagIds.includes(t.id));

  const handleCreateAndAttach = () => {
    if (!newLabel.trim()) return;
    createTag.mutate(
      { label: newLabel, color: newColor },
      {
        onSuccess: (tag) => {
          addTag.mutate({ accountId, tagId: tag.id });
          setNewLabel('');
          setNewColor(TAG_COLORS[0]);
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Tags
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {accountTags.map((tag) => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-medium"
            style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
            {tag.label}
            <button
              onClick={() => removeTag.mutate({ accountId, tagId: tag.id })}
              className="rounded-full hover:bg-foreground/10 p-0.5 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
              <Plus className="w-3 h-3" />
              Add custom tag
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-3" align="start">
            {availableTags.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Existing tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => addTag.mutate({ accountId, tagId: tag.id })}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-1 border-t">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-2">Create new tag</p>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Tag name"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAndAttach()}
              />
              <div className="flex items-center gap-1.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={cn(
                      'w-5 h-5 rounded-full transition-transform',
                      newColor === c && 'ring-2 ring-offset-2 ring-offset-popover ring-foreground scale-110',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <Button
                size="sm"
                className="w-full mt-1"
                disabled={!newLabel.trim() || createTag.isPending}
                onClick={handleCreateAndAttach}
              >
                Create & add
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tags are shared across accounts and filterable from the map toolbar.
      </p>
    </div>
  );
}
