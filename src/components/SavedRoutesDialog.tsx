import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bookmark, Loader2, Pencil, Trash2, Check, X, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/appStore';
import {
  listSavedRoutes, deleteSavedRoute, updateSavedRoute,
  type SavedRoute,
} from '@/lib/savedRoutes';
import { cn } from '@/lib/utils';

interface Props {
  triggerClassName?: string;
  triggerTitle?: string;
}

export default function SavedRoutesDialog({ triggerClassName, triggerTitle = 'My Routes' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmReplaceRoute, setConfirmReplaceRoute] = useState<SavedRoute | null>(null);

  const {
    loadRouteFromSnapshot,
    setLoadedSavedRouteId,
    routeStops,
    loadedSavedRouteId,
  } = useAppStore();

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      setRoutes(await listSavedRoutes());
    } catch (e) {
      console.error(e);
      toast.error('Could not load your saved routes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchRoutes();
  }, [open]);

  const openRoute = (r: SavedRoute) => {
    loadRouteFromSnapshot(r.stops);
    setLoadedSavedRouteId(r.id);
    setOpen(false);
    setConfirmReplaceRoute(null);
    toast.success(`Opened "${r.name}"`);
  };

  const handleOpenClick = (r: SavedRoute) => {
    const hasUnsaved = routeStops.length > 0 && loadedSavedRouteId !== r.id;
    if (hasUnsaved) {
      setConfirmReplaceRoute(r);
      return;
    }
    openRoute(r);
  };

  const startRename = (r: SavedRoute) => {
    setRenamingId(r.id);
    setRenameValue(r.name);
  };

  const commitRename = async (r: SavedRoute) => {
    const name = renameValue.trim();
    if (!name || name === r.name) {
      setRenamingId(null);
      return;
    }
    try {
      await updateSavedRoute(r.id, { name });
      setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, name } : x)));
      toast.success('Renamed.');
    } catch (e) {
      console.error(e);
      toast.error('Could not rename.');
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedRoute(id);
      setRoutes((prev) => prev.filter((x) => x.id !== id));
      toast.success('Deleted.');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            title={triggerTitle}
            aria-label={triggerTitle}
            className={cn(
              'touch-button rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 transition-all inline-flex items-center justify-center',
              triggerClassName,
            )}
          >
            <Bookmark className="w-5 h-5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5" />
              My Routes
            </DialogTitle>
            <DialogDescription>
              Reopen a saved route to keep editing it, then re-save or start navigation.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
              </div>
            ) : routes.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                You haven't saved any routes yet.
                <br />
                Open <b>Route Overview</b> after planning a route and click <b>Save to My Routes</b>.
              </div>
            ) : (
              <ul className="space-y-2">
                {routes.map((r) => {
                  const stops = Array.isArray(r.stops) ? r.stops.length : 0;
                  const date = new Date(r.created_at).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  });
                  const isRenaming = renamingId === r.id;
                  return (
                    <li key={r.id} className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename(r);
                                  if (e.key === 'Escape') setRenamingId(null);
                                }}
                                className="h-8"
                              />
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => commitRename(r)}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRenamingId(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="font-medium truncate">{r.name}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {stops} stop{stops !== 1 ? 's' : ''} • saved {date}
                            {loadedSavedRouteId === r.id && (
                              <span className="ml-2 text-primary font-medium">• currently open</span>
                            )}
                          </div>
                        </div>
                        {!isRenaming && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" onClick={() => handleOpenClick(r)}>Open</Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startRename(r)} title="Rename">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletingId(r.id)} title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this route?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && handleDelete(deletingId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmReplaceRoute} onOpenChange={(o) => !o && setConfirmReplaceRoute(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current route?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {routeStops.length} stop{routeStops.length !== 1 ? 's' : ''} in progress. Opening this saved route will replace them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmReplaceRoute && openRoute(confirmReplaceRoute)}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
