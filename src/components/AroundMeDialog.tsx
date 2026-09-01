import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Binoculars,
  Building,
  ShoppingBag,
  Briefcase,
  Factory,
  Stethoscope,
  Hotel,
  MoreHorizontal,
  Loader2,
  X,
  MapPin,
  Building2,
  Crosshair,
} from 'lucide-react';
import { ProspectCategory, prospectCategoryLabels } from '@/types/account';
import { useAppStore, type SearchOrigin } from '@/store/appStore';
import {
  buildSearchPhrase,
  searchAroundMe,
} from '@/lib/aroundMeSearch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const prospectCategoryOptions: { key: ProspectCategory; icon: typeof Building }[] = [
  { key: 'officeBuilding', icon: Briefcase },
  { key: 'retailCenter', icon: ShoppingBag },
  { key: 'apartment', icon: Building },
  { key: 'industrial', icon: Factory },
  { key: 'medical', icon: Stethoscope },
  { key: 'hospitality', icon: Hotel },
  { key: 'mixedUse', icon: Building2 },
  { key: 'other', icon: MoreHorizontal },
];

type OriginKind = SearchOrigin['kind'];

export default function AroundMeDialog() {
  const {
    isAroundMeOpen,
    setAroundMeOpen,
    userLocation,
    setAroundMeResults,
    clearAroundMeResults,
    aroundMeResults,
    aroundMeOrigin,
    setAroundMeOrigin,
    aroundMeCategories,
    accounts,
    selectedAccount,
    mapCenter,
  } = useAppStore();

  const [selected, setSelected] = useState<ProspectCategory[]>([]);
  const [loading, setLoading] = useState(false);

  // When dialog opens, prefill selected categories from prior search (edit mode)
  useEffect(() => {
    if (isAroundMeOpen) {
      setSelected(aroundMeCategories);
    }
  }, [isAroundMeOpen, aroundMeCategories]);

  const phrase = useMemo(() => buildSearchPhrase(selected), [selected]);

  // Resolve the chosen origin to coordinates + label
  const resolvedOrigin = useMemo<{
    coords: [number, number] | null;
    label: string;
    sublabel: string;
  }>(() => {
    if (!aroundMeOrigin) {
      return { coords: null, label: 'No origin selected', sublabel: 'Pick a search origin above' };
    }
    if (aroundMeOrigin.kind === 'account') {
      const account = accounts.find((l) => l.id === aroundMeOrigin.accountId);
      if (account) {
        return {
          coords: [account.longitude, account.latitude],
          label: account.accountName,
          sublabel: [account.routeCity, account.routeState].filter(Boolean).join(', '),
        };
      }
      return { coords: null, label: 'Selected account unavailable', sublabel: '' };
    }
    if (aroundMeOrigin.kind === 'mapCenter') {
      const [lat, lng] = mapCenter;
      return {
        coords: [lng, lat],
        label: 'Current map view',
        sublabel: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      };
    }
    // user
    return {
      coords: userLocation,
      label: 'My current location',
      sublabel: userLocation ? 'GPS' : 'Location not available',
    };
  }, [aroundMeOrigin, accounts, userLocation, mapCenter]);

  // When dialog opens, listen for live map center updates
  const [liveMapCenter, setLiveMapCenter] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!isAroundMeOpen) return;
    const handler = (e: CustomEvent<{ lng: number; lat: number }>) => {
      setLiveMapCenter([e.detail.lng, e.detail.lat]);
    };
    window.addEventListener('mapCenterChanged', handler as EventListener);
    // request current map center
    window.dispatchEvent(new Event('requestMapCenter'));
    return () => window.removeEventListener('mapCenterChanged', handler as EventListener);
  }, [isAroundMeOpen]);

  const effectiveOrigin = useMemo(() => {
    if (aroundMeOrigin?.kind === 'mapCenter' && liveMapCenter) {
      return {
        coords: liveMapCenter,
        label: 'Current map view',
        sublabel: `${liveMapCenter[1].toFixed(4)}, ${liveMapCenter[0].toFixed(4)}`,
      };
    }
    return resolvedOrigin;
  }, [aroundMeOrigin, liveMapCenter, resolvedOrigin]);

  const toggle = (i: ProspectCategory) => {
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
    );
  };

  const handleSearch = async () => {
    if (!effectiveOrigin.coords) {
      toast.error('Search origin is not available.');
      return;
    }
    if (selected.length === 0) return;

    setLoading(true);
    try {
      const results = await searchAroundMe(selected, effectiveOrigin.coords, 5);
      setAroundMeResults(results, phrase, effectiveOrigin.label, selected);
      if (results.length === 0) {
        toast.info(
          `No ${phrase.toLowerCase()} found within 5 miles of ${effectiveOrigin.label}. Mapbox coverage for property types like HOAs and new construction can be sparse — try adding more property types or moving the search origin.`,
          { duration: 8000 },
        );
      } else {
        toast.success(`Found ${results.length} ${phrase.toLowerCase()} near ${effectiveOrigin.label}.`);
        setAroundMeOpen(false);
      }
    } catch (e) {
      console.error('[AroundMeDialog] search failed', e);
      toast.error('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    clearAroundMeResults();
    setAroundMeOrigin(null);
    setSelected([]);
    setAroundMeOpen(false);
    toast.info('Search results cleared.');
  };

  const originOptions: { kind: OriginKind; icon: typeof MapPin; label: string; sublabel: string; disabled: boolean; payload: SearchOrigin }[] = [
    {
      kind: 'user',
      icon: Crosshair,
      label: 'My current location',
      sublabel: userLocation ? 'GPS' : 'Location not available',
      disabled: !userLocation,
      payload: { kind: 'user' },
    },
    {
      kind: 'account',
      icon: Building2,
      label: selectedAccount ? `Account: ${selectedAccount.accountName}` : 'A specific account',
      sublabel: selectedAccount
        ? [selectedAccount.routeCity, selectedAccount.routeState].filter(Boolean).join(', ')
        : 'Click a account pin first to enable',
      disabled: !selectedAccount,
      payload: selectedAccount ? { kind: 'account', accountId: selectedAccount.id } : { kind: 'account', accountId: '' },
    },
    {
      kind: 'mapCenter',
      icon: MapPin,
      label: 'Current map view',
      sublabel: 'Pan/zoom the map to where you want to search',
      disabled: false,
      payload: { kind: 'mapCenter' },
    },
  ];

  // If origin is `account` but selectedAccount changed since opening, keep its accountId
  // (already wired via openAroundMeWithOrigin from caller). Nothing else needed.

  return (
    <Dialog open={isAroundMeOpen} onOpenChange={setAroundMeOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Binoculars className="w-5 h-5 text-status-active" />
            Search around a point
          </DialogTitle>
          <DialogDescription>
            Find companies within 5 miles of any location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Origin selector */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Search around
            </p>
            <div className="space-y-2">
              {originOptions.map(({ kind, icon: Icon, label, sublabel, disabled, payload }) => {
                const isActive = !!aroundMeOrigin && aroundMeOrigin.kind === kind &&
                  (kind !== 'account' ||
                    (aroundMeOrigin.kind === 'account' && payload.kind === 'account' &&
                      aroundMeOrigin.accountId === payload.accountId));
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={disabled}
                    onClick={() => setAroundMeOrigin(payload)}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-sm transition-colors text-left',
                      isActive
                        ? 'border-status-active bg-status-active/10'
                        : 'border-border hover:bg-muted/50',
                      disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                    )}
                  >
                    <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', isActive ? 'text-status-active' : 'text-muted-foreground')} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{label}</p>
                      <p className="text-xs text-muted-foreground truncate">{sublabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prospect category selector */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Property Types
            </p>
            <div className="grid grid-cols-2 gap-2">
              {prospectCategoryOptions.map(({ key, icon: Icon }) => {
                const checked = selected.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors text-left',
                      checked
                        ? 'border-status-active bg-status-active/10 text-foreground'
                        : 'border-border hover:bg-muted/50 text-foreground',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(key)}
                      onClick={(e) => e.stopPropagation()}
                      className="data-[state=checked]:bg-status-active data-[state=checked]:border-status-active"
                    />
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{prospectCategoryLabels[key]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 px-3 py-2 min-h-[44px] flex items-center">
            <p className="text-sm text-muted-foreground">
              {!aroundMeOrigin ? (
                <span className="italic">Select a search origin above…</span>
              ) : selected.length === 0 ? (
                <span className="italic">Select at least one property type…</span>
              ) : (
                <>
                  Searching for <span className="font-medium text-foreground">{phrase}</span>{' '}
                  near <span className="font-medium text-foreground">{effectiveOrigin.label}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {aroundMeResults.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleClear}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Clear Results
            </Button>
          )}
          <Button
            onClick={handleSearch}
            disabled={selected.length === 0 || loading || !effectiveOrigin.coords}
            className="bg-status-active hover:bg-status-active/90 text-white gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching…
              </>
            ) : (
              <>
                <Binoculars className="w-4 h-4" />
                Search
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
