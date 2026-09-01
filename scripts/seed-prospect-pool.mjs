// One-time seed script: populates prospect_pool_companies with a fictional
// "prospect pool" for the Encore demo's Prospect tab (Clay-style location +
// category search). Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-prospect-pool.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Same Bay Area territory as the seeded accounts, so the pool and the map
// feel like the same territory. [lat, lng, city, state]
const CITIES = [
  [37.6935, -121.9269, 'Pleasanton', 'CA'],
  [37.7021, -121.9358, 'Dublin', 'CA'],
  [37.7799, -121.9780, 'San Ramon', 'CA'],
  [37.9101, -122.0652, 'Walnut Creek', 'CA'],
  [37.8044, -122.2712, 'Oakland', 'CA'],
  [37.7749, -122.4194, 'San Francisco', 'CA'],
  [37.3382, -121.8863, 'San Jose', 'CA'],
  [37.5485, -121.9886, 'Fremont', 'CA'],
  [37.6819, -121.7680, 'Livermore', 'CA'],
  [37.9780, -122.0311, 'Concord', 'CA'],
];

const CATEGORIES = ['officeBuilding', 'retailCenter', 'apartment', 'industrial', 'medical', 'hospitality', 'mixedUse', 'other'];

const NAME_PREFIXES = ['Summit', 'Bayview', 'Harborview', 'Crestline', 'Cornerstone', 'Meridian', 'Parkside', 'Redwood', 'Skyline', 'Golden Gate', 'Silverlake', 'Northgate', 'Eastridge', 'Westfield', 'Union', 'Liberty', 'Founders', 'Beacon', 'Ridgeline', 'Vista'];
const NAME_SUFFIXES = ['Plaza', 'Center', 'Commons', 'Tower', 'Park', 'Campus', 'Square', 'Pavilion', 'Exchange', 'Landing', 'Crossing', 'Point', 'Gardens', 'Village', 'Station'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(value, spread) {
  return value + (Math.random() - 0.5) * spread;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildFictionalCompanies(count) {
  const companies = [];
  const usedNames = new Set();
  while (companies.length < count) {
    const name = `${randomFrom(NAME_PREFIXES)} ${randomFrom(NAME_SUFFIXES)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    const [lat, lng, city, state] = randomFrom(CITIES);
    const category = randomFrom(CATEGORIES);
    const streetNum = 100 + Math.floor(Math.random() * 8900);
    const domain = `${slugify(name)}.com`;

    companies.push({
      company_name: name,
      category,
      address: `${streetNum} ${randomFrom(['Main St', 'Commerce Way', 'Corporate Dr', 'Airway Blvd', 'Industrial Pkwy', 'Market St'])}`,
      city,
      state,
      latitude: jitter(lat, 0.06),
      longitude: jitter(lng, 0.06),
      website: `https://www.${domain}`,
      phone: `925-555-${String(1000 + Math.floor(Math.random() * 9000)).slice(1)}`,
      source: 'seed',
    });
  }
  return companies;
}

// Real companies with real domains, in the same territory, so a live demo's
// "Find contacts" click on one of these actually returns real LeadMagic
// results instead of stalling on a fake domain — same trick used on
// ProYard's "Salesforce Tower" account.
const REAL_COMPANIES = [
  { company_name: 'Salesforce Tower', category: 'officeBuilding', address: '415 Mission St', city: 'San Francisco', state: 'CA', latitude: 37.7897, longitude: -122.3972, website: 'https://www.salesforce.com', phone: '415-555-0100', source: 'seed' },
  { company_name: 'Adobe Almaden Tower', category: 'officeBuilding', address: '345 Park Ave', city: 'San Jose', state: 'CA', latitude: 37.3300, longitude: -121.8950, website: 'https://www.adobe.com', phone: '408-555-0100', source: 'seed' },
  { company_name: 'Chevron San Ramon Campus', category: 'officeBuilding', address: '6001 Bollinger Canyon Rd', city: 'San Ramon', state: 'CA', latitude: 37.7599, longitude: -121.9426, website: 'https://www.chevron.com', phone: '925-555-0100', source: 'seed' },
  { company_name: 'Clorox Headquarters', category: 'officeBuilding', address: '1221 Broadway', city: 'Oakland', state: 'CA', latitude: 37.8055, longitude: -122.2691, website: 'https://www.thecloroxcompany.com', phone: '510-555-0100', source: 'seed' },
];

const companies = [...buildFictionalCompanies(66), ...REAL_COMPANIES];

const { data, error } = await supabase.from('prospect_pool_companies').insert(companies).select('id, company_name');
if (error) {
  console.error('Seed failed:', error.message);
  process.exit(1);
}

console.log(`Seeded ${data.length} prospect pool companies.`);
console.log('Real-domain companies:', REAL_COMPANIES.map((c) => c.company_name).join(', '));
