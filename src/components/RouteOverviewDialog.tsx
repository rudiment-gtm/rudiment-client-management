import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { useAppStore, type RouteStop } from '@/store/appStore';
import { statusConfig, serviceConfig, isFullService, FULL_SERVICE_CONFIG, prospectCategoryLabels, type Account } from '@/types/account';
import { List, MapPin, Building2, User, Briefcase, Mail, Phone, Copy, Share2, Binoculars, GripVertical, Link as LinkIcon, Loader2, X, Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { createSharedRoute } from '@/lib/shareRoute';
import { createSavedRoute, updateSavedRoute } from '@/lib/savedRoutes';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function getContactName(account: Account): string {
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(' ');
  return fullName || account.primaryContact || account.secondaryContact || '—';
}

function getServicesLabel(account: Account): string {
  if (isFullService(account.services)) return FULL_SERVICE_CONFIG.label;
  return account.services.map((s) => serviceConfig[s].label).join(', ');
}

export default function RouteOverviewDialog() {
  const { routeStops, accounts, reorderRouteStops, loadedSavedRouteId, setLoadedSavedRouteId } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Signature of the current route so we can invalidate the cached share code
  // whenever the user reorders/adds/removes stops.
  const routeSignature = useMemo(
    () => routeStops.map((s) => `${s.kind}:${s.id}`).join('|'),
    [routeStops],
  );
  const [share, setShare] = useState<{ code: string; url: string; signature: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);

  useEffect(() => {
    if (share && share.signature !== routeSignature) {
      setShare(null);
      setShowSharePanel(false);
    }
  }, [routeSignature, share]);

  useEffect(() => {
    setJustSaved(false);
  }, [routeSignature]);


  const handleCreateShare = async () => {
    if (showSharePanel) return;
    if (share && share.signature === routeSignature) {
      setShowSharePanel(true);
      return;
    }
    setSharing(true);
    try {
      const { code, url } = await createSharedRoute({ stops: routeStops });
      setShare({ code, url, signature: routeSignature });
      setShowSharePanel(true);
      toast.success('Share code ready!');
    } catch (e) {
      console.error(e);
      toast.error('Could not create a share code.');
    } finally {
      setSharing(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied!`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const handleShareLink = async () => {
    if (!share) return;
    const text = `Open this route in Encore: ${share.url}\n(or paste code ${share.code})`;
    // Prefer native share on mobile
    if (typeof navigator !== 'undefined' && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share({ title: 'Encore', text, url: share.url });
        return;
      } catch {
        // fall through to mailto
      }
    }
    const a = document.createElement('a');
    a.href = `mailto:?subject=${encodeURIComponent('Encore')}&body=${encodeURIComponent(text)}`;
    a.rel = 'noopener';
    a.click();
  };


  // Resolve each stop into a renderable form (drop account stops whose account vanished)
  type ResolvedStop =
    | { kind: 'account'; stop: Extract<RouteStop, { kind: 'account' }>; account: typeof accounts[0]; key: string; routeIndex: number }
    | { kind: 'aroundMe'; stop: Extract<RouteStop, { kind: 'aroundMe' }>; key: string; routeIndex: number };

  const resolved: ResolvedStop[] = routeStops
    .map((stop, routeIndex): ResolvedStop | null => {
      const key = `${stop.kind}:${stop.id}`;
      if (stop.kind === 'account') {
        const account = accounts.find((l) => l.id === stop.id);
        return account ? { kind: 'account', stop, account, key, routeIndex } : null;
      }
      return { kind: 'aroundMe', stop, key, routeIndex };
    })
    .filter((x): x is ResolvedStop => x !== null);

  const generatePlainText = () => {
    return resolved
      .map((entry, index) => {
        if (entry.kind === 'account') {
          const { account } = entry;
          const statusMeta = statusConfig[account.accountStatus];
          const lines = [
            `Stop ${index + 1}: ${account.accountName}`,
            `Services: ${getServicesLabel(account)}`,
            `Status: ${statusMeta.label}`,
            `Contact: ${getContactName(account)}`,
            `Title: ${account.jobTitle || ''}`,
            account.mainEmail ? `Email: ${account.mainEmail}` : null,
            account.mainPhone ? `Phone: ${account.mainPhone}` : null,
            `Address: ${account.routeAddress || ''}`,
          ].filter(Boolean);
          return lines.join('\n');
        }
        const s = entry.stop;
        return [
          `Stop ${index + 1}: ${s.name}`,
          `Type: Around Me result`,
          `Category: ${prospectCategoryLabels[s.prospectCategory] || s.prospectCategory}`,
          s.category ? `Type detail: ${s.category}` : null,
          `Address: ${s.address || `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`}`,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n---\n\n');
  };

  const handleCopy = async () => {
    const text = generatePlainText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Route copied to clipboard!');
    } catch {
      toast.error('Failed to copy route');
    }
  };

  const handleShare = () => {
    const text = generatePlainText();
    const subject = encodeURIComponent(`Route Overview - ${resolved.length} stop${resolved.length !== 1 ? 's' : ''}`);
    const body = encodeURIComponent(text);
    // Use an anchor click rather than `window.location.href = mailto:` so the
    // SPA stays mounted (some browser/OS combos treat the assignment as a
    // top-level navigation and unload the app, losing route state).
    const a = document.createElement('a');
    a.href = `mailto:?subject=${subject}&body=${body}`;
    a.rel = 'noopener';
    a.click();
  };

  const handleSaveNew = async () => {
    if (saving) return;
    const defaultName = `Route – ${new Date().toLocaleDateString()} (${resolved.length} stop${resolved.length !== 1 ? 's' : ''})`;
    const name = window.prompt('Name this route:', defaultName)?.trim();
    if (!name) return;
    setSaving(true);
    try {
      const saved = await createSavedRoute({ name, stops: routeStops });
      setLoadedSavedRouteId(saved.id);
      setJustSaved(true);
      toast.success('Saved to My Routes.');
    } catch (e) {
      console.error(e);
      toast.error('Could not save the route.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSaved = async () => {
    if (!loadedSavedRouteId || saving) return;
    setSaving(true);
    try {
      await updateSavedRoute(loadedSavedRouteId, { stops: routeStops });
      setJustSaved(true);
      toast.success('Saved route updated.');
    } catch (e) {
      console.error(e);
      toast.error('Could not update the saved route.');
    } finally {
      setSaving(false);
    }
  };


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromStop = resolved.find((r) => r.key === active.id);
    const toStop = resolved.find((r) => r.key === over.id);
    if (!fromStop || !toStop) return;
    reorderRouteStops(fromStop.routeIndex, toStop.routeIndex);
  };

  if (resolved.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full gap-2 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80"
          size="sm"
        >
          <List className="w-4 h-4" />
          Route Overview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <List className="w-5 h-5" />
            Route Overview ({resolved.length} stop{resolved.length !== 1 ? 's' : ''})
          </DialogTitle>
          <DialogDescription className="text-xs mt-1">
            Drag the handle to reorder stops. Navigation will follow the order shown here.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={resolved.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {resolved.map((entry, index) => (
                  <SortableStopRow
                    key={entry.key}
                    id={entry.key}
                    index={index}
                    isLast={index === resolved.length - 1}
                  >
                    {entry.kind === 'account' ? (
                      <AccountStopCard account={entry.account} />
                    ) : (
                      <AroundMeStopCard stop={entry.stop} />
                    )}
                  </SortableStopRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <div className="shrink-0 pt-4 border-t border-border mt-4 space-y-3">
          {showSharePanel && share && (
            <div className="relative rounded-md bg-muted/40 p-3 space-y-2">
              <button
                type="button"
                onClick={() => setShowSharePanel(false)}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground p-1"
                aria-label="Close share panel"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 pr-6 text-sm font-medium">
                <LinkIcon className="w-4 h-4 text-primary" />
                Share to another device
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={share.code} className="font-mono tracking-widest text-center" />
                <Button size="sm" variant="outline" onClick={() => copyText(share.code, 'Code')} className="gap-1 shrink-0">
                  <Copy className="w-3.5 h-3.5" /> Code
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={share.url} className="text-xs" />
                <Button size="sm" variant="outline" onClick={() => copyText(share.url, 'Link')} className="gap-1 shrink-0">
                  <Copy className="w-3.5 h-3.5" /> Link
                </Button>
              </div>
              <Button size="sm" onClick={handleShareLink} className="gap-2 w-full">
                <Share2 className="w-4 h-4" /> Share…
              </Button>
              <p className="text-[11px] text-muted-foreground">Expires in 30 days.</p>
            </div>
          )}

          <DialogFooter className="flex flex-row justify-end gap-2 sm:justify-end">
            {loadedSavedRouteId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleUpdateSaved}
                    disabled={saving}
                    aria-label={justSaved ? 'Updated' : 'Update saved route'}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : justSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{justSaved ? 'Updated' : 'Update Saved Route'}</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleSaveNew}
                    disabled={saving}
                    aria-label={justSaved ? 'Saved' : 'Save to My Routes'}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : justSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{justSaved ? 'Saved' : 'Save to My Routes'}</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCreateShare}
                  disabled={sharing || showSharePanel}
                  aria-label="Generate share code"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
                >
                  {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{showSharePanel ? 'Share Code' : 'Generate Share Code'}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleShare}
                  aria-label="Email route"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition"
                >
                  <Mail className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Email</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopy}
                  aria-label="Copy route text"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Copy Text</TooltipContent>
            </Tooltip>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortableStopRow({
  id,
  index,
  isLast,
  children,
}: {
  id: string;
  index: number;
  isLast: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative pl-8">
      {/* Vertical line connector */}
      {!isLast && <div className="absolute left-3 top-8 bottom-[-12px] w-0.5 bg-border" />}

      {/* Stop number badge */}
      <div
        className={cn(
          'absolute left-0 top-0 w-6 h-6 rounded-full',
          'flex items-center justify-center',
          'text-xs font-bold text-primary-foreground bg-primary',
        )}
      >
        {index + 1}
      </div>

      <div className={cn('flex items-stretch gap-2', isDragging && 'ring-2 ring-primary/40 rounded-lg')}>
        <button
          type="button"
          aria-label={`Reorder stop ${index + 1}`}
          className="flex items-center px-1 -ml-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function AccountStopCard({ account }: { account: ReturnType<typeof useAppStore.getState>['accounts'][0] }) {
  const statusMeta = statusConfig[account.accountStatus];
  return (
    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-semibold">{account.accountName}</span>
        </div>
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium shrink-0', statusMeta.bgClass)}>
          {statusMeta.label}
        </span>
      </div>

      <div className="text-sm text-muted-foreground">{getServicesLabel(account)}</div>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{getContactName(account)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{account.jobTitle || ''}</span>
        </div>

        {account.mainEmail && (
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
            <a href={`mailto:${account.mainEmail}`} className="text-primary hover:underline truncate">
              {account.mainEmail}
            </a>
          </div>
        )}

        {account.mainPhone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
            <a href={`tel:${account.mainPhone}`} className="text-primary hover:underline">
              {account.mainPhone}
            </a>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-sm pt-1 border-t border-border">
        <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <span className="text-muted-foreground">{account.routeAddress || ''}</span>
      </div>
    </div>
  );
}

function AroundMeStopCard({ stop }: { stop: Extract<RouteStop, { kind: 'aroundMe' }> }) {
  return (
    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-semibold">{stop.name}</span>
        </div>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 bg-pink-500/15 text-pink-600 dark:text-pink-400 inline-flex items-center gap-1">
          <Binoculars className="w-3 h-3" />
          Around Me
        </span>
      </div>

      <div className="text-sm text-muted-foreground">
        {prospectCategoryLabels[stop.prospectCategory] || stop.prospectCategory}
        {stop.category ? ` • ${stop.category}` : ''}
      </div>

      <div className="flex items-start gap-2 text-sm pt-1 border-t border-border">
        <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <span className="text-muted-foreground">
          {stop.address || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`}
        </span>
      </div>
    </div>
  );
}
