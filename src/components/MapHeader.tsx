import { useState, useRef, useEffect } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';
import { CrmSyncDialog } from '@/components/CrmSyncDialog';
import { UserMenu } from '@/components/UserMenu';
import ImportCsvButton from '@/components/ImportCsvButton';
import { Account } from '@/types/account';
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapbox';
import { toast } from 'sonner';

// Many accounts have no named person on file — just a company + phone/email —
// so fall back gracefully instead of showing "undefined".
function getContactName(account: Account): string {
  return (
    [account.firstName, account.lastName].filter(Boolean).join(' ') ||
    account.primaryContact ||
    account.secondaryContact ||
    ''
  );
}

export default function MapHeader() {
  const { isRouteModeActive, routeStops, isSidebarOpen, accounts, setSelectedAccount, setPendingPoolImport, setActiveTab } = useAppStore();

  const handleImported = (result: { ids: string[]; count: number }) => {
    setPendingPoolImport(result);
    setActiveTab('leads');
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Filter accounts based on search query (trim to handle accounting/trailing whitespace)
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = normalizedQuery.length >= 2
    ? accounts.filter(account => {
        const contactName = getContactName(account);
        return (
          account.accountName.toLowerCase().includes(normalizedQuery) ||
          contactName.toLowerCase().includes(normalizedQuery) ||
          (account.routeCity?.toLowerCase().includes(normalizedQuery)) ||
          (account.mainEmail?.toLowerCase().includes(normalizedQuery)) ||
          (account.mainPhone?.includes(normalizedQuery))
        );
      })
    : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAccount = (account: Account) => {
    setSelectedAccount(account);
    setSearchQuery('');
    setIsSearchFocused(false);
    
    // Dispatch custom event to center map on account
    window.dispatchEvent(new CustomEvent('centerOnAccount', { 
      detail: { latitude: account.latitude, longitude: account.longitude } 
    }));
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const handlePlaceSearch = async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) return;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&country=us&types=place,region,district,locality,postcode,neighborhood`;
      const res = await fetch(url);
      const data = await res.json();
      const feature = data?.features?.[0];
      if (!feature) {
        toast.error(`No place found for "${q}"`);
        return;
      }
      window.dispatchEvent(new CustomEvent('flyToPlace', {
        detail: { bbox: feature.bbox, center: feature.center },
      }));
      setSearchQuery('');
      setIsSearchFocused(false);
    } catch (e) {
      console.error('[MapHeader] place search failed', e);
      toast.error('Place search failed');
    }
  };
  
  return (
    <header className={cn(
      "fixed top-0 z-30 h-14 transition-all duration-300",
      "flex items-center justify-between px-4",
      "bg-card/95 backdrop-blur-sm border-b shadow-sm",
      isSidebarOpen ? "left-72" : "left-0 md:left-16",
      "right-0 md:right-14"
    )}>
      {/* Left side - Search */}
      <div className="flex items-center gap-3 flex-1">
        {!isSidebarOpen && (
          <div className="w-8" /> // Spacer for mobile toggle
        )}
        <div ref={searchRef} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                e.preventDefault();
                handlePlaceSearch(searchQuery);
              }
            }}
            className={cn(
              "w-full h-10 pl-10 pr-10 rounded-lg",
              "bg-muted/50 border-0",
              "text-sm placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/20",
              "transition-all"
            )}
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          {/* Search Results Dropdown */}
          {isSearchFocused && normalizedQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg overflow-hidden z-50">
              {searchResults.length > 0 ? (
                <ul className="py-1 max-h-80 overflow-y-auto">
                  {searchResults.map((account) => (
                    <li key={account.id}>
                      <button
                        onClick={() => handleSelectAccount(account)}
                        className="w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors flex items-start gap-3"
                      >
                        <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {account.accountName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[getContactName(account), [account.routeCity, account.routeState].filter(Boolean).join(', ')]
                              .filter(Boolean)
                              .join(' • ')}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No contacts found for "{searchQuery}"
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Right side - Status & Actions */}
      <div className="flex items-center gap-3">
        {isRouteModeActive && routeStops.length > 0 && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-sm font-medium text-primary">
              {routeStops.length} stops
            </span>
          </div>
        )}
        

        <ImportCsvButton onImported={handleImported} />

        <CrmSyncDialog />

        <UserMenu />
      </div>
    </header>
  );
}
