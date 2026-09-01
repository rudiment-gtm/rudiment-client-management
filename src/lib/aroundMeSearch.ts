import { ProspectCategory, prospectCategoryLabels } from '@/types/account';
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapbox';

export interface AroundMeResult {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  address: string;
  category: string;
  prospectCategory: ProspectCategory;
  distanceMiles: number;
}

const MILES_PER_DEGREE_LAT = 69;

// Mapbox Search Box canonical category IDs per prospect category.
// Reference: https://docs.mapbox.com/api/search/search-box/#category-search
const prospectCategoryMap: Record<ProspectCategory, string[]> = {
  officeBuilding: ['office', 'professional_services'],
  retailCenter: ['shopping', 'department_store', 'convenience_store'],
  apartment: ['apartment_condo'],
  industrial: [],
  medical: ['clinic', 'hospital'],
  hospitality: ['hotel'],
  mixedUse: [],
  other: ['business'],
};

// Free-text search terms per prospect category, run via Mapbox Search Box
// /forward endpoint. Use these for property types not covered by canonical
// Mapbox categories (industrial parks, mixed-use developments rarely show up as POIs).
const prospectQueryMap: Partial<Record<ProspectCategory, string[]>> = {
  officeBuilding: ['office building', 'corporate office', 'business park'],
  retailCenter: ['retail center', 'shopping plaza', 'strip mall'],
  apartment: ['apartment complex', 'apartment community', 'townhomes', 'condominiums'],
  industrial: ['industrial park', 'warehouse', 'distribution center', 'business park'],
  medical: ['medical office building', 'healthcare facility', 'medical center'],
  hospitality: ['hotel', 'hospitality property'],
  mixedUse: ['mixed-use development', 'mixed-use property'],
};

export function buildSearchPhrase(categories: ProspectCategory[]): string {
  if (categories.length === 0) return '';
  const labels = categories.map((c) => prospectCategoryLabels[c]);
  if (labels.length === 1) return `${labels[0]} properties`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} properties`;
  const last = labels[labels.length - 1];
  return `${labels.slice(0, -1).join(', ')}, and ${last} properties`;
}

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface SearchBoxFeature {
  type: string;
  geometry?: { type: string; coordinates: [number, number] };
  properties?: {
    mapbox_id?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
    poi_category_ids?: string[];
  };
}

async function searchOneCategory(
  categoryId: string,
  prospectCategory: ProspectCategory,
  userLng: number,
  userLat: number,
  radiusMiles: number,
): Promise<AroundMeResult[]> {
  const latDelta = radiusMiles / MILES_PER_DEGREE_LAT;
  const lngDelta =
    radiusMiles / (MILES_PER_DEGREE_LAT * Math.cos((userLat * Math.PI) / 180));
  const bbox = [
    userLng - lngDelta,
    userLat - latDelta,
    userLng + lngDelta,
    userLat + latDelta,
  ].join(',');

  const url = `https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(
    categoryId,
  )}?proximity=${userLng},${userLat}&bbox=${bbox}&limit=25&access_token=${MAPBOX_ACCESS_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[aroundMeSearch] category "${categoryId}" HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const features: SearchBoxFeature[] = data.features || [];
    console.log(`[aroundMeSearch] category "${categoryId}" returned ${features.length} features`);

    const results: AroundMeResult[] = [];
    for (const f of features) {
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const [lng, lat] = coords;
      const dist = haversineMiles(userLat, userLng, lat, lng);
      if (dist > radiusMiles) continue;
      const id = f.properties?.mapbox_id || `${lng},${lat}`;
      results.push({
        id,
        name: f.properties?.name || 'Unnamed',
        longitude: lng,
        latitude: lat,
        address:
          f.properties?.full_address ||
          f.properties?.place_formatted ||
          '',
        category: (f.properties?.poi_category || []).join(', '),
        prospectCategory,
        distanceMiles: dist,
      });
    }
    return results;
  } catch (e) {
    console.error(`[aroundMeSearch] category "${categoryId}" failed`, e);
    return [];
  }
}

async function searchOneQuery(
  query: string,
  prospectCategory: ProspectCategory,
  userLng: number,
  userLat: number,
  radiusMiles: number,
): Promise<AroundMeResult[]> {
  const latDelta = radiusMiles / MILES_PER_DEGREE_LAT;
  const lngDelta =
    radiusMiles / (MILES_PER_DEGREE_LAT * Math.cos((userLat * Math.PI) / 180));
  const bbox = [
    userLng - lngDelta,
    userLat - latDelta,
    userLng + lngDelta,
    userLat + latDelta,
  ].join(',');

  const url = `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(
    query,
  )}&types=poi&proximity=${userLng},${userLat}&bbox=${bbox}&limit=10&access_token=${MAPBOX_ACCESS_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[aroundMeSearch] query "${query}" HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const features: SearchBoxFeature[] = data.features || [];
    console.log(`[aroundMeSearch] query "${query}" returned ${features.length} features`);

    const results: AroundMeResult[] = [];
    for (const f of features) {
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const [lng, lat] = coords;
      const dist = haversineMiles(userLat, userLng, lat, lng);
      if (dist > radiusMiles) continue;
      const id = f.properties?.mapbox_id || `${lng},${lat}`;
      results.push({
        id,
        name: f.properties?.name || 'Unnamed',
        longitude: lng,
        latitude: lat,
        address:
          f.properties?.full_address ||
          f.properties?.place_formatted ||
          '',
        category: (f.properties?.poi_category || []).join(', ') || query,
        prospectCategory,
        distanceMiles: dist,
      });
    }
    return results;
  } catch (e) {
    console.error(`[aroundMeSearch] query "${query}" failed`, e);
    return [];
  }
}

export async function searchAroundMe(
  prospectCategories: ProspectCategory[],
  userLocation: [number, number], // [lng, lat]
  radiusMiles = 5,
): Promise<AroundMeResult[]> {
  if (prospectCategories.length === 0) return [];
  const [lng, lat] = userLocation;

  // Build (prospectCategory, categoryId) pairs and (prospectCategory, query) pairs
  const tasks: Promise<AroundMeResult[]>[] = [];
  for (const prospectCategory of prospectCategories) {
    const mapboxCategories = prospectCategoryMap[prospectCategory] || [];
    for (const cat of mapboxCategories) {
      tasks.push(searchOneCategory(cat, prospectCategory, lng, lat, radiusMiles));
    }
    const queries = prospectQueryMap[prospectCategory] || [];
    for (const q of queries) {
      tasks.push(searchOneQuery(q, prospectCategory, lng, lat, radiusMiles));
    }
  }

  const all = (await Promise.all(tasks)).flat();
  console.log(`[aroundMeSearch] total raw results: ${all.length}`);

  const merged = new Map<string, AroundMeResult>();
  all.forEach((r) => {
    if (!merged.has(r.id)) merged.set(r.id, r);
  });

  return [...merged.values()].sort((a, b) => a.distanceMiles - b.distanceMiles);
}
