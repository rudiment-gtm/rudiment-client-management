import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link as LinkIcon, Loader2 } from 'lucide-react';
import { loadSharedRoute } from '@/lib/shareRoute';
import { useAppStore } from '@/store/appStore';
import { toast } from 'sonner';

interface Props {
  triggerVariant?: 'sidebar' | 'inline';
}

export default function LoadSharedRouteDialog({ triggerVariant = 'sidebar' }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const loadRouteFromSnapshot = useAppStore((s) => s.loadRouteFromSnapshot);

  const extractCode = (raw: string) => {
    const trimmed = raw.trim();
    // Accept full URL like https://.../r/ABC123 or plain code
    const match = trimmed.match(/\/r\/([A-Za-z0-9-]+)/);
    return (match ? match[1] : trimmed).toUpperCase();
  };

  const handleLoad = async () => {
    const code = extractCode(value);
    if (!code) return;
    setBusy(true);
    try {
      const snap = await loadSharedRoute(code);
      if (!snap) {
        toast.error('Route not found or expired.');
        return;
      }
      loadRouteFromSnapshot(snap.stops);
      toast.success(`Loaded ${snap.stops.length} stop${snap.stops.length !== 1 ? 's' : ''}.`);
      setOpen(false);
      setValue('');
    } catch (e) {
      console.error(e);
      toast.error('Could not load that route.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerVariant === 'sidebar' ? (
          <Button
            variant="outline"
            className="w-full gap-2 bg-primary/20 border-primary text-primary-foreground hover:bg-sidebar-accent"
          >
            <LinkIcon className="w-4 h-4" />
            Load Shared Route
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="gap-1 h-8 text-xs text-sidebar-muted">
            <LinkIcon className="w-3.5 h-3.5" />
            Load
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Load a shared route</DialogTitle>
          <DialogDescription>
            Paste a share code or link from another device to rebuild the route here.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 7F3K9Q or https://.../r/7F3K9Q"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) handleLoad();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleLoad} disabled={busy || !value.trim()} className="gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Load Route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
