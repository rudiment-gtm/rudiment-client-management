import { useEffect, useRef, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAppStore, useFilteredAccounts } from '@/store/appStore';
import {
  statusConfig,
  prospectCategoryLabels,
  Account,
} from '@/types/account';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Map, Satellite, List, Plus, Binoculars, Pencil, Route, X } from 'lucide-react';
import AddAccountDialog from './AddAccountDialog';
import MapListView from './MapListView';
import MapLegend from './MapLegend';
import SavedRoutesDialog from './SavedRoutesDialog';
import { cn } from '@/lib/utils';
import type { AroundMeResult } from '@/lib/aroundMeSearch';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateAccountFromAroundMe } from '@/hooks/useAccounts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapbox';
import { attachLongPress } from '@/lib/longPress';

// Pin color is status-driven — tells the "Keep / Win Back / Go Get" story
// directly on the map. Individual per-service colors only show up in the
// account drawer's service badges, not on the map itself.
function getAccountPinColor(account: Pick<Account, 'accountStatus'>): string {
  return statusConfig[account.accountStatus].color;
}

export default function AccountMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const aroundMeMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const routeLayerAdded = useRef(false);
  const geolocateControlRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const userLocationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const accountsById = useRef<globalThis.Map<string, Account>>(new globalThis.Map());
  const prevSelectedId = useRef<string | null>(null);
  
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [initTick, setInitTick] = useState(0);
  const [visibleSnapshot, setVisibleSnapshot] = useState<{ accounts: Account[]; aroundMe: AroundMeResult[] }>({ accounts: [], aroundMe: [] });
  
  const queryClient = useQueryClient();

  
  const filteredAccounts = useFilteredAccounts();
  const { 
    setSelectedAccount, 
    isRouteModeActive, 
    toggleAccountForRoute, 
    toggleAroundMeForRoute,
    routeStops,
    accounts,
    userLocation,
    setUserLocation,
    isSidebarOpen,
    aroundMeResults,
    aroundMeOriginLabel,
    isAroundMeOpen,
    aroundMeOrigin,
    selectedAccount,
    mapCenter: storeMapCenter,
    openAroundMeWithOrigin,
    setAroundMeOpen,
    toggleRouteMode,
  } = useAppStore();

  const hasAroundMeResults = aroundMeResults.length > 0;

  const createAccountFromAroundMe = useCreateAccountFromAroundMe();
  
  // Initialize map
  useEffect(() => {
    console.log('[AccountMap] Init effect — token present:', !!MAPBOX_ACCESS_TOKEN, 'container:', !!mapContainer.current, 'map:', !!map.current);
    if (map.current) return;
    if (!MAPBOX_ACCESS_TOKEN) {
      console.error('[AccountMap] Aborting init: VITE_MAPBOX_ACCESS_TOKEN is not set.');
      return;
    }
    // Container may not be mounted yet on the first run — retry on next frame.
    if (!mapContainer.current) {
      console.warn('[AccountMap] Container not ready, retrying next frame');
      const raf = requestAnimationFrame(() => setInitTick((t) => t + 1));
      return () => cancelAnimationFrame(raf);
    }

    // Get user's location first, then initialize map centered on them
    const initMap = (center: [number, number], zoom: number) => {
      if (!mapContainer.current || map.current) return;
      
      mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
      
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: center,
        zoom: zoom,
        attributionControl: false,
      });

      // Add navigation controls
      map.current.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        'bottom-right'
      );

      // Add geolocation control for manual re-centering
      const geolocateControl = new mapboxgl.GeolocateControl({
        positionOptions: { 
          enableHighAccuracy: true, // Use GPS for accuracy
          timeout: 60000, // 60 second timeout
          maximumAge: 60000 // Accept 1 minute old cached position
        },
        trackUserLocation: true,
        showUserHeading: true,
      });
      
      geolocateControlRef.current = geolocateControl;
      map.current.addControl(geolocateControl, 'bottom-right');
      
      // Handle geolocation errors
      geolocateControl.on('error', (e: GeolocationPositionError) => {
        console.log('[AccountMap] GeolocateControl error:', e.code, e.message);
      });

      // Add attribution
      map.current.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-left'
      );

      // Double-click to add new account
      map.current.on('dblclick', (e) => {
        e.preventDefault();
        setClickedCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        setAddAccountOpen(true);
      });

      // Mark map as loaded when style is ready
      map.current.on('load', () => {
        console.log('[AccountMap] Map load event fired');
        setMapLoaded(true);
        // Ensure canvas fills container after initial render
        setTimeout(() => map.current?.resize(), 100);
      });

      // After a basemap style change, custom sources/layers must be re-added.
      map.current.on('style.load', () => {
        setStyleVersion((v) => v + 1);
      });


      // Broadcast map center changes for AroundMeDialog "Current map view" origin
      map.current.on('moveend', () => {
        if (!map.current) return;
        const c = map.current.getCenter();
        window.dispatchEvent(new CustomEvent('mapCenterChanged', { detail: { lng: c.lng, lat: c.lat } }));
      });

      // Also check if map is already loaded (can happen with cached styles)
      if (map.current.loaded()) {
        console.log('[AccountMap] Map already loaded on init');
        setMapLoaded(true);
      }

      // Right-click (context menu) to add new account
      map.current.on('contextmenu', (e) => {
        e.preventDefault();
        setClickedCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        setAddAccountOpen(true);
      });
    };

    // Fallback to IP-based geolocation via edge function
    const getIPLocation = async (): Promise<[number, number] | null> => {
      try {
        console.log('[AccountMap] Trying IP-based geolocation...');
        const { data, error } = await supabase.functions.invoke('get-location');
        
        if (error) {
          console.log('[AccountMap] IP geolocation error:', error);
          return null;
        }
        
        if (data?.success && data.latitude && data.longitude) {
          console.log('[AccountMap] IP geolocation SUCCESS:', data);
          toast.info(`Located via IP: ${data.city || 'Unknown'}, ${data.region || ''}`);
          return [data.longitude, data.latitude];
        }
        return null;
      } catch (err) {
        console.log('[AccountMap] IP geolocation failed:', err);
        return null;
      }
    };

    // Try browser geolocation first, then IP fallback
    console.log('[AccountMap] Requesting geolocation...');
    
    const handleGeolocationSuccess = (position: GeolocationPosition) => {
      console.log('[AccountMap] Browser geolocation SUCCESS:', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
      setUserLocation(coords);
      initMap(coords, 14); // Higher zoom for accurate location
      toast.success(`Located via GPS (±${Math.round(position.coords.accuracy)}m)`);
    };

    const handleGeolocationError = async (error: GeolocationPositionError) => {
      console.log('[AccountMap] Browser geolocation failed:', error.code, error.message);
      
      // Show user why GPS failed
      const errorMessages: Record<number, string> = {
        1: 'Location permission denied. Please allow location access.',
        2: 'Location unavailable. Using approximate location.',
        3: 'Location request timed out. Using approximate location.',
      };
      
      toast.warning(errorMessages[error.code] || 'GPS unavailable. Using approximate location.', {
        description: 'For precise location, open in a new tab and allow GPS access.',
        duration: 5000,
      });
      
      // Try IP-based fallback
      const ipLocation = await getIPLocation();
      if (ipLocation) {
        setUserLocation(ipLocation);
        initMap(ipLocation, 11);
      } else {
        console.log('[AccountMap] All geolocation methods failed, using default NYC');
        toast.warning('Could not determine your location. Showing default area.');
        initMap([-73.956, 40.7128], 10.5);
      }
    };

    if (navigator.geolocation) {
      // First try high accuracy (GPS) - may take longer but more precise
      console.log('[AccountMap] Trying high accuracy GPS...');
      navigator.geolocation.getCurrentPosition(
        handleGeolocationSuccess,
        (error) => {
          console.log('[AccountMap] High accuracy failed, trying low accuracy...', error.message);
          // If high accuracy fails, try low accuracy (network-based)
          navigator.geolocation.getCurrentPosition(
            handleGeolocationSuccess,
            handleGeolocationError,
            { 
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000
            }
          );
        },
        { 
          enableHighAccuracy: true,  // Try GPS first
          timeout: 15000,            // Give GPS 15 seconds
          maximumAge: 60000          // Accept 1 minute old cached GPS position
        }
      );
    } else {
      console.log('[AccountMap] Browser geolocation not available');
      handleGeolocationError({ code: 2, message: 'Not available', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    }

    return () => {
      map.current?.remove();
      map.current = null;
      setMapLoaded(false);
    };
    // setUserLocation is a stable Zustand action reference; included for exhaustive-deps.
  }, [initTick, setUserLocation]);

  // Resize map when sidebar toggles
  useEffect(() => {
    if (!map.current) return;
    const timer = setTimeout(() => map.current?.resize(), 350);
    return () => clearTimeout(timer);
  }, [isSidebarOpen]);

  // ResizeObserver to handle any container size changes
  useEffect(() => {
    const container = mapContainer.current;
    if (!container || !map.current) return;
    const observer = new ResizeObserver(() => {
      map.current?.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [mapLoaded]);

  // Listen for centerOnAccount events from search
  useEffect(() => {
    const handleCenterOnAccount = (event: CustomEvent<{ latitude: number; longitude: number }>) => {
      if (map.current && event.detail) {
        map.current.flyTo({
          center: [event.detail.longitude, event.detail.latitude],
          zoom: 15,
          duration: 1500,
        });
      }
    };

    window.addEventListener('centerOnAccount', handleCenterOnAccount as EventListener);
    return () => window.removeEventListener('centerOnAccount', handleCenterOnAccount as EventListener);
  }, []);

  // Listen for previewAccount events from list view — fly to pin and show hover popup
  useEffect(() => {
    const handlePreviewAccount = (event: CustomEvent<{ id: string; latitude: number; longitude: number }>) => {
      const m = map.current;
      if (!m || !event.detail) return;
      const { id, latitude, longitude } = event.detail;
      m.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1200 });
      const account = accounts.find((l) => l.id === id);
      const reveal = () => {
        if (account) showPopup(account);
        try {
          if (m.getSource('accounts-source')) {
            if (prevSelectedId.current && prevSelectedId.current !== id) {
              m.setFeatureState({ source: 'accounts-source', id: prevSelectedId.current }, { selected: false });
            }
            m.setFeatureState({ source: 'accounts-source', id }, { selected: true });
            prevSelectedId.current = id;
          }
        } catch {
          // source may not be ready yet; ignore
        }
      };
      // Wait for flyTo to settle so the pin is rendered before showing the popup
      m.once('moveend', reveal);
    };

    window.addEventListener('previewAccount', handlePreviewAccount as EventListener);
    return () => window.removeEventListener('previewAccount', handlePreviewAccount as EventListener);
  }, [accounts]);


  // Listen for "open Add Account in manual mode" from sidebar
  useEffect(() => {
    const handler = () => {
      setClickedCoords(null);
      setAddAccountOpen(true);
    };
    window.addEventListener('openAddAccountManual', handler);
    return () => window.removeEventListener('openAddAccountManual', handler);
  }, []);

  // Listen for flyToPlace events from search bar (city/state geocoding)
  useEffect(() => {
    const handleFlyToPlace = (event: CustomEvent<{ bbox?: [number, number, number, number]; center: [number, number] }>) => {
      if (!map.current || !event.detail) return;
      const { bbox, center } = event.detail;
      if (bbox && bbox.length === 4) {
        map.current.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 80, duration: 1200, maxZoom: 14 }
        );
      } else if (center) {
        map.current.flyTo({ center, zoom: 12, duration: 1200 });
      }
    };
    window.addEventListener('flyToPlace', handleFlyToPlace as EventListener);
    return () => window.removeEventListener('flyToPlace', handleFlyToPlace as EventListener);
  }, []);

  // Respond to AroundMeDialog asking for current map center
  useEffect(() => {
    const handler = () => {
      if (!map.current) return;
      const c = map.current.getCenter();
      window.dispatchEvent(new CustomEvent('mapCenterChanged', { detail: { lng: c.lng, lat: c.lat } }));
    };
    window.addEventListener('requestMapCenter', handler);
    return () => window.removeEventListener('requestMapCenter', handler);
  }, []);

  // Draw a 5-mile search radius circle while AroundMeDialog is open
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    const SOURCE_ID = 'around-me-radius-src';
    const FILL_ID = 'around-me-radius-fill';
    const LINE_ID = 'around-me-radius-line';

    const removeLayer = () => {
      if (m.getLayer(LINE_ID)) m.removeLayer(LINE_ID);
      if (m.getLayer(FILL_ID)) m.removeLayer(FILL_ID);
      if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
    };

    if (!isAroundMeOpen) {
      removeLayer();
      return;
    }

    // Resolve center from origin
    let center: [number, number] | null = null;
    if (!aroundMeOrigin) {
      removeLayer();
      return;
    }
    if (aroundMeOrigin.kind === 'user') center = userLocation;
    else if (aroundMeOrigin.kind === 'account') {
      const account = accounts.find((l) => l.id === aroundMeOrigin.accountId);
      if (account) center = [account.longitude, account.latitude];
    } else if (aroundMeOrigin.kind === 'mapCenter') {
      const c = m.getCenter();
      center = [c.lng, c.lat];
    }
    if (!center) {
      removeLayer();
      return;
    }

    // Build a polygon approximation of a 5-mile circle
    const buildCircle = (lng: number, lat: number, miles: number, points = 64) => {
      const coords: [number, number][] = [];
      const distRadians = miles / 3958.8;
      const latRad = (lat * Math.PI) / 180;
      const lngRad = (lng * Math.PI) / 180;
      for (let i = 0; i <= points; i++) {
        const bearing = (i * 2 * Math.PI) / points;
        const lat2 = Math.asin(
          Math.sin(latRad) * Math.cos(distRadians) +
            Math.cos(latRad) * Math.sin(distRadians) * Math.cos(bearing),
        );
        const lng2 = lngRad +
          Math.atan2(
            Math.sin(bearing) * Math.sin(distRadians) * Math.cos(latRad),
            Math.cos(distRadians) - Math.sin(latRad) * Math.sin(lat2),
          );
        coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
      }
      return coords;
    };

    const updateData = () => {
      const c = aroundMeOrigin?.kind === 'mapCenter'
        ? (() => { const cc = m.getCenter(); return [cc.lng, cc.lat] as [number, number]; })()
        : center!;
      const ring = buildCircle(c[0], c[1], 5);
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
      const src = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data as GeoJSON.Feature);
      } else {
        m.addSource(SOURCE_ID, { type: 'geojson', data: data as GeoJSON.Feature });
        m.addLayer({
          id: FILL_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.12 },
        });
        m.addLayer({
          id: LINE_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: { 'line-color': '#16a34a', 'line-width': 2, 'line-dasharray': [2, 2] },
        });
      }
    };

    updateData();

    // For mapCenter mode, update circle as the user pans
    let onMove: (() => void) | null = null;
    if (aroundMeOrigin?.kind === 'mapCenter') {
      onMove = () => updateData();
      m.on('move', onMove);
    }

    return () => {
      if (onMove) m.off('move', onMove);
      removeLayer();
    };
  }, [isAroundMeOpen, aroundMeOrigin, userLocation, accounts, mapLoaded]);

  // Show user location marker with click-to-relocate functionality
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;

    // Remove existing user location marker
    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.remove();
    }

    // Create custom user location marker element
    const el = document.createElement('div');
    el.className = 'user-location-marker';
    el.title = 'Your location - Click to set manually';
    el.innerHTML = `
      <div class="user-location-dot">
        <div class="user-location-pulse"></div>
        <div class="user-location-center"></div>
      </div>
    `;

    // Click on marker to enable manual location setting
    el.addEventListener('click', () => {
      toast.info('Click anywhere on the map to set your location', {
        duration: 5000,
      });
      
      // Enable one-time click handler for setting location
      const setLocationHandler = (e: mapboxgl.MapMouseEvent) => {
        const newLocation: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        setUserLocation(newLocation);
        map.current?.flyTo({ center: newLocation, zoom: 14 });
        toast.success('Location updated!');
        map.current?.off('click', setLocationHandler);
      };
      
      map.current?.once('click', setLocationHandler);
    });

    userLocationMarkerRef.current = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat(userLocation)
      .addTo(map.current);

    // Update location when marker is dragged
    userLocationMarkerRef.current.on('dragend', () => {
      const lngLat = userLocationMarkerRef.current?.getLngLat();
      if (lngLat) {
        const newLocation: [number, number] = [lngLat.lng, lngLat.lat];
        setUserLocation(newLocation);
        toast.success('Location updated!');
      }
    });

    console.log('[AccountMap] User location marker added at:', userLocation);
  }, [mapLoaded, userLocation]);
  // Get route from Mapbox Directions API
  const fetchRoute = useCallback(async (coordinates: [number, number][]) => {
    if (coordinates.length < 2 || !map.current) return;

    const coordString = coordinates.map(c => c.join(',')).join(';');
    
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
      );
      
      const data = await response.json();
      
      if (data.routes && data.routes[0]) {
        const route = data.routes[0].geometry;
        
        // Add or update route layer
        if (map.current.getSource('route')) {
          (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData({
            type: 'Feature',
            properties: {},
            geometry: route,
          });
        } else {
          map.current.addLayer({
            id: 'route',
            type: 'line',
            source: {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: route,
              },
            },
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#3b82f6',
              'line-width': 5,
              'line-opacity': 0.8,
            },
          });
          routeLayerAdded.current = true;
        }
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
  }, []);

  // Clear route when exiting route mode
  useEffect(() => {
    if (!isRouteModeActive && map.current && routeLayerAdded.current) {
      if (map.current.getLayer('route')) {
        map.current.removeLayer('route');
      }
      if (map.current.getSource('route')) {
        map.current.removeSource('route');
      }
      routeLayerAdded.current = false;
    }
  }, [isRouteModeActive]);

  // Update route when stops change - include user location as starting point
  useEffect(() => {
    if (isRouteModeActive && routeStops.length >= 1) {
      const stopCoordinates: [number, number][] = routeStops
        .map((stop) => {
          if (stop.kind === 'account') {
            const l = accounts.find((x) => x.id === stop.id);
            return l ? [l.longitude, l.latitude] as [number, number] : null;
          }
          return [stop.longitude, stop.latitude] as [number, number];
        })
        .filter((c): c is [number, number] => c !== null);

      // Prepend user location if available
      let coordinates: [number, number][] = [];
      if (userLocation) {
        coordinates = [userLocation, ...stopCoordinates];
      } else {
        coordinates = stopCoordinates;
      }

      if (coordinates.length >= 2) {
        fetchRoute(coordinates);
      }
    }
  }, [routeStops, isRouteModeActive, accounts, fetchRoute, userLocation]);

  // Set up the GeoJSON source/layer for account pins (GPU-rendered, fast at scale).
  // Also wires hover/click handlers and re-adds the layer when the basemap style changes.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    const SOURCE_ID = 'accounts-source';
    const LAYER_ID = 'accounts-layer';

    if (!m.getSource(SOURCE_ID)) {
      m.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      });
    }
    if (!m.getLayer(LAYER_ID)) {
      m.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 11,
            7,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 3,
            2,
          ],
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    const onMove = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      m.getCanvas().style.cursor = 'pointer';
      const id = e.features[0].id as string;
      const account = accountsById.current.get(id);
      if (account) showPopup(account);
    };
    const onLeave = () => {
      m.getCanvas().style.cursor = '';
      popupRef.current?.remove();
      popupRef.current = null;
    };

    // Long-press state for Mapbox layer pins
    let pressTimer: number | null = null;
    let pressStartPx: mapboxgl.Point | null = null;
    let pressAccountId: string | null = null;
    let longPressFiredAt = 0;
    const clearPress = () => {
      if (pressTimer !== null) {
        window.clearTimeout(pressTimer);
        pressTimer = null;
      }
      pressStartPx = null;
      pressAccountId = null;
    };

    const onLayerDown = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as string;
      const account = accountsById.current.get(id);
      if (!account) return;
      clearPress();
      pressStartPx = e.point;
      pressAccountId = account.id;
      pressTimer = window.setTimeout(() => {
        pressTimer = null;
        longPressFiredAt = Date.now();
        try { navigator.vibrate?.(20); } catch { /* ignore */ }
        const l = accountsById.current.get(pressAccountId!);
        pressStartPx = null;
        pressAccountId = null;
        if (l) setSelectedAccount(l);
      }, 500);
    };
    const onMapMove = (e: mapboxgl.MapMouseEvent) => {
      if (pressTimer === null || !pressStartPx) return;
      const dx = e.point.x - pressStartPx.x;
      const dy = e.point.y - pressStartPx.y;
      if (dx * dx + dy * dy > 100) clearPress();
    };
    const onMapUp = () => clearPress();

    const onClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      // Long-press just fired — swallow the click that follows pointer-up.
      if (Date.now() - longPressFiredAt < 400) {
        longPressFiredAt = 0;
        return;
      }
      const id = e.features[0].id as string;
      const account = accountsById.current.get(id);
      if (!account) return;
      if (useAppStore.getState().isRouteModeActive) {
        toggleAccountForRoute(account.id);
      } else {
        setSelectedAccount(account);
      }
    };

    m.on('mousemove', LAYER_ID, onMove);
    m.on('mouseleave', LAYER_ID, onLeave);
    m.on('click', LAYER_ID, onClick);
    m.on('mousedown', LAYER_ID, onLayerDown);
    m.on('touchstart', LAYER_ID, onLayerDown);
    m.on('mousemove', onMapMove);
    m.on('touchmove', onMapMove);
    m.on('mouseup', onMapUp);
    m.on('touchend', onMapUp);
    m.on('touchcancel', onMapUp);

    return () => {
      m.off('mousemove', LAYER_ID, onMove);
      m.off('mouseleave', LAYER_ID, onLeave);
      m.off('click', LAYER_ID, onClick);
      m.off('mousedown', LAYER_ID, onLayerDown);
      m.off('touchstart', LAYER_ID, onLayerDown);
      m.off('mousemove', onMapMove);
      m.off('touchmove', onMapMove);
      m.off('mouseup', onMapUp);
      m.off('touchend', onMapUp);
      m.off('touchcancel', onMapUp);
      clearPress();
    };
  }, [mapLoaded, styleVersion, setSelectedAccount, toggleAccountForRoute]);

  // Push filtered accounts into the GeoJSON source; render numbered DOM markers for route stops.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;

    // Lookup for hover/click resolution
    accountsById.current.clear();
    filteredAccounts.forEach((l) => accountsById.current.set(l.id, l));

    const routeAccountIds = new Set(
      routeStops.filter((s) => s.kind === 'account').map((s) => s.id)
    );

    const features = filteredAccounts
      .filter((l) => !routeAccountIds.has(l.id) && l.longitude && l.latitude)
      .map((l) => ({
        type: 'Feature' as const,
        id: l.id,
        properties: { id: l.id, status: l.accountStatus, color: getAccountPinColor(l) },
        geometry: { type: 'Point' as const, coordinates: [l.longitude, l.latitude] },
      }));

    const src = m.getSource('accounts-source') as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData({ type: 'FeatureCollection', features });
    }

    // Clear old DOM markers (used only for numbered route stops now)
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = [];

    routeStops.forEach((stop, idx) => {
      if (stop.kind !== 'account') return;
      const account = accounts.find((l) => l.id === stop.id);
      if (!account || !account.longitude || !account.latitude) return;
      const color = getAccountPinColor(account);
      const el = document.createElement('div');
      const pinEl = document.createElement('div');
      pinEl.style.cssText = `
        width: 36px;
        height: 36px;
        background-color: ${color};
        border: 4px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s ease-out;
        animation: pulse 2s infinite;
      `;
      pinEl.innerHTML = `<span style="color: white; font-size: 12px; font-weight: bold;">${idx + 1}</span>`;
      el.appendChild(pinEl);

      pinEl.addEventListener('mouseenter', () => {
        pinEl.style.transform = 'scale(1.15)';
        showPopup(account);
      });
      pinEl.addEventListener('mouseleave', () => {
        pinEl.style.transform = 'scale(1)';
        popupRef.current?.remove();
        popupRef.current = null;
      });
      const lp = attachLongPress(pinEl, () => setSelectedAccount(account));
      pinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (lp.wasJustLongPressed()) return;
        if (useAppStore.getState().isRouteModeActive) {
          toggleAccountForRoute(account.id);
        } else {
          setSelectedAccount(account);
        }
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([account.longitude, account.latitude])
        .addTo(m);
      markersRef.current.push(marker);
    });
  }, [filteredAccounts, routeStops, accounts, mapLoaded, styleVersion, setSelectedAccount, toggleAccountForRoute]);

  // Fit the map to show all visible accounts whenever the set of visible ids
  // changes (filter applied, accounts loaded/added/removed). Skips re-fitting
  // on pure selection changes. Only matters when geolocation didn't already
  // center the map on the user — but running unconditionally is harmless and
  // is what actually gets reps looking at their own territory instead of the
  // NYC/IP-fallback default when geolocation fails (e.g. in this preview).
  const prevFitKeyRef = useRef<string>('');
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const withCoords = filteredAccounts.filter((a) => a.latitude && a.longitude);
    if (withCoords.length === 0) return;
    const key = withCoords.map((a) => a.id).sort().join(',');
    if (key === prevFitKeyRef.current) return;
    prevFitKeyRef.current = key;

    const bounds = new mapboxgl.LngLatBounds();
    withCoords.forEach((a) => bounds.extend([a.longitude, a.latitude]));
    map.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
  }, [filteredAccounts, mapLoaded]);

  // Selected-account highlight via feature-state (no DOM churn)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    if (!m.getSource('accounts-source')) return;

    if (prevSelectedId.current && prevSelectedId.current !== selectedAccount?.id) {
      try {
        m.setFeatureState({ source: 'accounts-source', id: prevSelectedId.current }, { selected: false });
      } catch {
        // feature may not exist in current data
      }
    }
    if (selectedAccount?.id) {
      try {
        m.setFeatureState({ source: 'accounts-source', id: selectedAccount.id }, { selected: true });
        prevSelectedId.current = selectedAccount.id;
      } catch {
        // ignore
      }
    } else {
      prevSelectedId.current = null;
    }
  }, [selectedAccount, mapLoaded, styleVersion, filteredAccounts]);



  // Around Me result markers (temporary green pins from Mapbox POI search)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    aroundMeMarkersRef.current.forEach((m) => m.remove());
    aroundMeMarkersRef.current = [];

    aroundMeResults.forEach((result) => {
      const stopId = `am:${result.id}`;
      const stopIndex = routeStops.findIndex((s) => s.id === stopId);
      const isInRoute = stopIndex !== -1;
      // Stop number = position in routeStops + 1 (consistent with account pins)
      const routeOrder = isInRoute ? stopIndex + 1 : 0;

      const el = document.createElement('div');
      const pinEl = document.createElement('div');
      pinEl.style.cssText = `
        width: ${isInRoute ? '36px' : '30px'};
        height: ${isInRoute ? '36px' : '30px'};
        background-color: #ec4899;
        border: ${isInRoute ? '4px' : '3px'} solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(236,72,153,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s ease-out;
      `;
      if (isInRoute) {
        pinEl.innerHTML = `<span style="color: white; font-size: 12px; font-weight: bold;">${routeOrder}</span>`;
      } else {
        pinEl.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="14" r="4"/>
            <circle cx="18" cy="14" r="4"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
        `;
      }
      el.appendChild(pinEl);


      pinEl.addEventListener('mouseenter', () => {
        pinEl.style.transform = 'scale(1.15)';
        popupRef.current?.remove();
        const hoverPopup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: '280px',
          offset: 18,
        })
          .setLngLat([result.longitude, result.latitude])
          .setHTML(`
            <div style="padding: 8px; min-width: 220px;">
              <h3 style="font-weight:600;font-size:14px;margin:0 0 4px 0;color:#1f2937;">
                ${result.name}
              </h3>
              <p style="font-size:12px;color:#6b7280;margin:0 0 8px 0;">
                ${result.address || ''}
              </p>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span style="display:inline-block;padding:3px 8px;border-radius:9999px;font-size:11px;font-weight:500;background-color:#ec489920;color:#be185d;">
                  ${result.distanceMiles.toFixed(1)} mi from ${aroundMeOriginLabel || 'origin'}
                </span>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${result.latitude},${result.longitude}&travelmode=driving"
                   target="_blank" rel="noopener noreferrer"
                   style="font-size:12px;color:#2563eb;text-decoration:none;font-weight:500;">
                  Directions →
                </a>
              </div>
            </div>
          `)
          .addTo(map.current!);
        popupRef.current = hoverPopup;
      });

      pinEl.addEventListener('mouseleave', () => {
        pinEl.style.transform = 'scale(1)';
        popupRef.current?.remove();
        popupRef.current = null;
      });


      const buildPreviewAccount = (): Account => {
        const parts = (result.address || '').split(',').map((p) => p.trim()).filter(Boolean);
        if (parts.length && /^(united states|usa|us)$/i.test(parts[parts.length - 1])) parts.pop();
        const street = parts[0] || result.address || result.name;
        const city = parts[1] || '';
        let state = '';
        let zip = '';
        if (parts.length >= 3) {
          const last = parts[parts.length - 1];
          const m = last.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
          if (m) { state = m[1].trim(); zip = m[2]; } else { state = last; }
        }
        return {
          id: `preview:${result.id}`,
          accountName: result.name,
          services: [],
          accountStatus: 'lead',
          accountNotes: prospectCategoryLabels[result.prospectCategory],
          routeAddress: street,
          routeCity: city,
          routeState: state,
          routeZip: zip,
          latitude: result.latitude,
          longitude: result.longitude,
          visitCount: 0,
          isAroundMePreview: true,
          aroundMeSourceId: result.id,
        };
      };

      const openPreview = () => {
        popupRef.current?.remove();
        popupRef.current = null;
        setSelectedAccount(buildPreviewAccount());
      };

      const lp = attachLongPress(pinEl, openPreview);

      pinEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (lp.wasJustLongPressed()) return;

        // In route mode, clicking the pin toggles it as a stop
        if (isRouteModeActive) {
          toggleAroundMeForRoute(result);
          return;
        }

        // Open the standard drawer in PREVIEW mode — no DB write yet.
        openPreview();
      });


      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([result.longitude, result.latitude])
        .addTo(map.current!);

      aroundMeMarkersRef.current.push(marker);
    });
  }, [aroundMeResults, mapLoaded, routeStops, isRouteModeActive, toggleAroundMeForRoute, aroundMeOriginLabel]);

  const showPopup = (account: Account) => {
    if (!map.current) return;
    
    // Remove existing popup
    popupRef.current?.remove();
    
    const config = statusConfig[account.accountStatus];
    const contactName =
      [account.firstName, account.lastName].filter(Boolean).join(' ') ||
      account.primaryContact ||
      account.secondaryContact ||
      null;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '280px',
      offset: 15,
    })
      .setLngLat([account.longitude, account.latitude])
      .setHTML(`
        <div style="padding: 8px;">
          <h3 style="font-weight: 600; font-size: 14px; margin: 0 0 4px 0; color: #1f2937;">
            ${account.accountName}
          </h3>
          ${(() => {
            const subtitle = [contactName, account.jobTitle].filter((s) => s && String(s).trim()).join(' • ');
            return subtitle
              ? `<p style="font-size: 12px; color: #6b7280; margin: 0 0 8px 0;">${subtitle}</p>`
              : '';
          })()}
          <span style="
            display: inline-block;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 500;
            background-color: ${config.color}20;
            color: ${config.color};
          ">
            ${config.label}
          </span>
        </div>
      `)
      .addTo(map.current);
    
    popupRef.current = popup;
  };


  const handleAccountAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
  };

  const toggleMapStyle = () => {
    if (!map.current) return;
    const newStyle = mapStyle === 'streets' ? 'satellite' : 'streets';
    const styleUrl = newStyle === 'streets' 
      ? 'mapbox://styles/mapbox/streets-v12' 
      : 'mapbox://styles/mapbox/satellite-streets-v12';
    map.current.setStyle(styleUrl);
    setMapStyle(newStyle);
  };

  return (
    <div className="h-full w-full relative">
      <div ref={mapContainer} className="h-full w-full" />
      {!MAPBOX_ACCESS_TOKEN && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/95 p-6">
          <div className="max-w-md text-center space-y-2">
            <h2 className="text-lg font-semibold">Map unavailable</h2>
            <p className="text-sm text-muted-foreground">
              The Mapbox access token (<code>VITE_MAPBOX_ACCESS_TOKEN</code>) isn't configured.
              Add it in your project environment variables and reload the preview.
            </p>
          </div>
        </div>
      )}
      
      {/* Map controls — vertical rail, right edge of the screen. Lives in
          its own strip rather than floating over the map canvas so it never
          sits on top of pins/labels. */}
      <div className="fixed z-20 flex items-center gap-2 rounded-lg border p-1.5 top-4 right-4 bg-sidebar/95 backdrop-blur-md border-sidebar-border md:top-14 md:bottom-0 md:right-0 md:rounded-none md:border-l md:border-t-0 md:p-4 md:flex-col md:gap-3 md:w-14">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleMapStyle}
              aria-label={mapStyle === 'streets' ? 'Satellite view' : 'Street view'}
              className="h-9 w-9 rounded-md bg-background/90 backdrop-blur-sm shadow-lg border inline-flex items-center justify-center hover:bg-background transition"
            >
              {mapStyle === 'streets' ? <Satellite className="h-4 w-4" /> : <Map className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>{mapStyle === 'streets' ? 'Satellite view' : 'Street view'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() =>
                hasAroundMeResults
                  ? setAroundMeOpen(true)
                  : openAroundMeWithOrigin(null)
              }
              aria-label={hasAroundMeResults ? 'Edit Around Me Results' : 'Around Me'}
              className="h-9 w-9 rounded-md bg-background/90 backdrop-blur-sm shadow-lg border inline-flex items-center justify-center hover:bg-background transition"
            >
              {hasAroundMeResults ? <Pencil className="h-4 w-4" /> : <Binoculars className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>{hasAroundMeResults ? 'Edit Results' : 'Around Me'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (!map.current) return;
                const bounds = map.current.getBounds();
                if (!bounds) return;
                const visibleAccounts = filteredAccounts.filter((l) =>
                  bounds.contains([l.longitude, l.latitude])
                );
                const visibleAroundMe = aroundMeResults.filter((r) =>
                  bounds.contains([r.longitude, r.latitude])
                );
                setVisibleSnapshot({ accounts: visibleAccounts, aroundMe: visibleAroundMe });
                setListOpen(true);
              }}
              aria-label="List view"
              className="h-9 w-9 rounded-md bg-background/90 backdrop-blur-sm shadow-lg border inline-flex items-center justify-center hover:bg-background transition"
            >
              <List className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>List view</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                setClickedCoords(null);
                setAddAccountOpen(true);
              }}
              aria-label="Add Account"
              className="h-9 w-9 rounded-md bg-primary text-white shadow-lg inline-flex items-center justify-center hover:bg-primary/90 transition"
            >
              <Plus className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>Add Account</TooltipContent>
        </Tooltip>

        <MapLegend />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleRouteMode}
              aria-label={isRouteModeActive ? 'Exit Route Mode' : 'Plan Route'}
              className={cn(
                'h-9 w-9 rounded-md shadow-lg inline-flex items-center justify-center transition',
                isRouteModeActive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-background/90 backdrop-blur-sm border hover:bg-background',
              )}
            >
              {isRouteModeActive ? <X className="h-4 w-4" /> : <Route className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>{isRouteModeActive ? 'Exit Route Mode' : 'Plan Route'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <SavedRoutesDialog triggerClassName="h-9 w-9 rounded-md bg-background/90 backdrop-blur-sm shadow-lg border hover:bg-background" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>My Routes</TooltipContent>
        </Tooltip>
      </div>


      <MapListView
        open={listOpen}
        onOpenChange={setListOpen}
        accounts={visibleSnapshot.accounts}
        allAccounts={accounts}
        aroundMeItems={visibleSnapshot.aroundMe}
      />

      {/* Add Account Dialog */}
      <AddAccountDialog
        open={addAccountOpen}
        onOpenChange={setAddAccountOpen}
        coordinates={clickedCoords}
        onAccountAdded={handleAccountAdded}
      />
      {/* Pulse animation and Mapbox overrides */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
        }
        
        @keyframes userLocationPulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }
        
        .user-location-marker {
          cursor: pointer;
        }
        
        .user-location-dot {
          position: relative;
          width: 24px;
          height: 24px;
        }
        
        .user-location-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 24px;
          height: 24px;
          background-color: rgba(59, 130, 246, 0.3);
          border-radius: 50%;
          animation: userLocationPulse 2s ease-out infinite;
        }
        
        .user-location-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 16px;
          height: 16px;
          background-color: #3b82f6;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        
        .mapboxgl-ctrl-group {
          border-radius: 8px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
          overflow: hidden;
        }
        
        .mapboxgl-ctrl-group button {
          width: 36px !important;
          height: 36px !important;
        }
        
        .mapboxgl-ctrl-group button:hover {
          background-color: #f3f4f6 !important;
        }
        
        .mapboxgl-popup-content {
          border-radius: 12px;
          padding: 0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        
        .mapboxgl-popup-close-button {
          font-size: 18px;
          padding: 4px 8px;
          color: #9ca3af;
        }
        
        .mapboxgl-popup-close-button:hover {
          color: #374151;
          background: transparent;
        }
        
        .mapboxgl-ctrl-attrib {
          font-size: 10px;
          background: rgba(255,255,255,0.7) !important;
        }
        
        .mapboxgl-user-location-dot {
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
        }
      `}</style>
    </div>
  );
}
