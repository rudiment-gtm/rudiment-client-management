import type { Account } from '@/types/account';
import type { RouteStop } from '@/store/appStore';

// Google Maps Directions URL API supports up to ~10 stops total
// (origin + destination + up to 8 waypoints). Beyond that, extra
// waypoints are silently dropped.
export const MAX_GOOGLE_MAPS_STOPS = 10;

export function wouldTruncateRoute(stopCount: number, hasUserLocation: boolean): boolean {
  // When user location is the origin, all stops count as waypoints + destination.
  // When not, the first stop is the origin.
  const totalPoints = hasUserLocation ? stopCount + 1 : stopCount;
  return totalPoints > MAX_GOOGLE_MAPS_STOPS;
}

export function buildGoogleMapsRouteUrl(
  routeStops: RouteStop[],
  accounts: Account[],
  userLocation: [number, number] | null,
): string | null {
  if (routeStops.length < 1) return null;

  const stopCoords = routeStops
    .map((stop) => {
      if (stop.kind === 'account') {
        const l = accounts.find((x) => x.id === stop.id);
        return l ? { latitude: l.latitude, longitude: l.longitude } : null;
      }
      return { latitude: stop.latitude, longitude: stop.longitude };
    })
    .filter((c): c is { latitude: number; longitude: number } => c !== null);

  if (stopCoords.length === 0) return null;

  const hasUserLocation = !!userLocation && userLocation[0] !== 0 && userLocation[1] !== 0;
  let url = `https://www.google.com/maps/dir/?api=1`;

  if (hasUserLocation) {
    url += `&origin=${userLocation![1]},${userLocation![0]}`;
    const destination = stopCoords[stopCoords.length - 1];
    url += `&destination=${destination.latitude},${destination.longitude}`;
    const waypoints = stopCoords.slice(0, -1);
    if (waypoints.length > 0) {
      url += `&waypoints=${encodeURIComponent(waypoints.map((w) => `${w.latitude},${w.longitude}`).join('|'))}`;
    }
  } else {
    const origin = stopCoords[0];
    const destination = stopCoords[stopCoords.length - 1];
    url += `&origin=${origin.latitude},${origin.longitude}`;
    url += `&destination=${destination.latitude},${destination.longitude}`;
    const waypoints = stopCoords.slice(1, -1);
    if (waypoints.length > 0) {
      url += `&waypoints=${encodeURIComponent(waypoints.map((w) => `${w.latitude},${w.longitude}`).join('|'))}`;
    }
  }

  url += `&travelmode=driving`;
  return url;
}

export function openGoogleMapsRoute(
  routeStops: RouteStop[],
  accounts: Account[],
  userLocation: [number, number] | null,
): { opened: boolean; truncated: boolean } {
  const url = buildGoogleMapsRouteUrl(routeStops, accounts, userLocation);
  if (!url) return { opened: false, truncated: false };
  const hasUserLocation = !!userLocation && userLocation[0] !== 0 && userLocation[1] !== 0;
  const truncated = wouldTruncateRoute(routeStops.length, hasUserLocation);
  window.open(url, '_blank');
  return { opened: true, truncated };
}
