// Generates 190 additional fictional Bay Area commercial-property accounts
// (on top of the 10 in seed-demo-accounts.mjs) for demo purposes — wide
// status/service/city variety so map filters, chat queries, etc. have
// something real to show. Deterministic (seeded RNG) so re-runs produce the
// same output for review before executing.
//
// Emits raw SQL to stdout — run via:
//   node scripts/generate-demo-accounts.mjs > /tmp/demo-accounts.sql
// then execute /tmp/demo-accounts.sql against the accounts table (e.g. via
// the Supabase Management API's /database/query endpoint).

// ---- seeded RNG (mulberry32) so output is reproducible ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260826);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
};
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

// ---- Bay Area cities: approx center coords + real area code, for realistic scatter ----
const CITIES = [
  { city: 'Pleasanton', state: 'CA', zip: '94588', lat: 37.6624, lng: -121.8747, area: '925' },
  { city: 'Dublin', state: 'CA', zip: '94568', lat: 37.7022, lng: -121.9358, area: '925' },
  { city: 'San Ramon', state: 'CA', zip: '94583', lat: 37.7799, lng: -121.9569, area: '925' },
  { city: 'Walnut Creek', state: 'CA', zip: '94596', lat: 37.9101, lng: -122.0652, area: '925' },
  { city: 'Concord', state: 'CA', zip: '94520', lat: 37.9780, lng: -122.0311, area: '925' },
  { city: 'Danville', state: 'CA', zip: '94526', lat: 37.8216, lng: -121.9999, area: '925' },
  { city: 'Martinez', state: 'CA', zip: '94553', lat: 38.0194, lng: -122.1341, area: '925' },
  { city: 'Pleasant Hill', state: 'CA', zip: '94523', lat: 37.9480, lng: -122.0608, area: '925' },
  { city: 'Antioch', state: 'CA', zip: '94509', lat: 38.0049, lng: -121.8058, area: '925' },
  { city: 'Brentwood', state: 'CA', zip: '94513', lat: 37.9319, lng: -121.6958, area: '925' },
  { city: 'Livermore', state: 'CA', zip: '94551', lat: 37.6819, lng: -121.7680, area: '925' },
  { city: 'Oakland', state: 'CA', zip: '94612', lat: 37.8044, lng: -122.2712, area: '510' },
  { city: 'Berkeley', state: 'CA', zip: '94704', lat: 37.8715, lng: -122.2730, area: '510' },
  { city: 'Emeryville', state: 'CA', zip: '94608', lat: 37.8313, lng: -122.2852, area: '510' },
  { city: 'Alameda', state: 'CA', zip: '94501', lat: 37.7652, lng: -122.2416, area: '510' },
  { city: 'San Leandro', state: 'CA', zip: '94577', lat: 37.7249, lng: -122.1561, area: '510' },
  { city: 'Hayward', state: 'CA', zip: '94541', lat: 37.6688, lng: -122.0808, area: '510' },
  { city: 'Castro Valley', state: 'CA', zip: '94546', lat: 37.6941, lng: -122.0863, area: '510' },
  { city: 'Union City', state: 'CA', zip: '94587', lat: 37.5934, lng: -122.0439, area: '510' },
  { city: 'Newark', state: 'CA', zip: '94560', lat: 37.5297, lng: -122.0402, area: '510' },
  { city: 'Fremont', state: 'CA', zip: '94538', lat: 37.5485, lng: -121.9886, area: '510' },
  { city: 'San Francisco', state: 'CA', zip: '94107', lat: 37.7749, lng: -122.4194, area: '415' },
  { city: 'San Jose', state: 'CA', zip: '95113', lat: 37.3382, lng: -121.8863, area: '408' },
  { city: 'Santa Clara', state: 'CA', zip: '95050', lat: 37.3541, lng: -121.9552, area: '408' },
  { city: 'Sunnyvale', state: 'CA', zip: '94085', lat: 37.3688, lng: -122.0363, area: '408' },
  { city: 'Milpitas', state: 'CA', zip: '95035', lat: 37.4323, lng: -121.8996, area: '408' },
  { city: 'Mountain View', state: 'CA', zip: '94043', lat: 37.3861, lng: -122.0839, area: '650' },
  { city: 'Palo Alto', state: 'CA', zip: '94301', lat: 37.4419, lng: -122.1430, area: '650' },
  { city: 'Redwood City', state: 'CA', zip: '94063', lat: 37.4852, lng: -122.2364, area: '650' },
  { city: 'San Mateo', state: 'CA', zip: '94402', lat: 37.5630, lng: -122.3255, area: '650' },
  { city: 'Burlingame', state: 'CA', zip: '94010', lat: 37.5841, lng: -122.3661, area: '650' },
];

const DESCRIPTORS = [
  'Business Park', 'Corporate Center', 'Corporate Plaza', 'Tech Campus', 'Financial Plaza',
  'Innovation Park', 'Executive Center', 'Commerce Center', 'Gateway Plaza', 'Office Park',
  'Corporate Campus', 'Professional Center', 'Technology Center', 'Business Center',
  'Trade Center', 'Commons', 'Landing', 'Pointe', 'Crossing', 'Square',
];
const STREET_NAMES = [
  'Chabot Dr', 'Hacienda Dr', 'Camino Ramon', 'N California Blvd', 'Diamond Blvd',
  'Hillcrest Ave', 'Muir Rd', 'Contra Costa Blvd', 'A St', 'Balfour Rd', 'Airway Blvd',
  'Broadway', 'Shattuck Ave', 'Christie Ave', 'Park St', 'Davis St', 'Foothill Blvd',
  'Redwood Rd', 'Alvarado Blvd', 'Cedar Blvd', 'Warm Springs Blvd', '2nd St', 'Market St',
  'Mission St', 'W St John St', 'The Alameda', 'El Camino Real', 'McCarthy Blvd', 'Great America Pkwy',
  'Moffett Blvd', 'California Ave', 'Bay Rd', 'El Camino Real', 'Broadway Ave', 'Burlingame Ave',
];
const BUILDING_TYPES = [
  'buildingEngineering', 'facilitySolutions', 'janitorial', 'specialProjects', 'landscape',
];
// Weighted combos (index-referencing BUILDING_TYPES) so "Full Service" (all 5) shows up too
const SERVICE_COMBOS = [
  ['janitorial'], ['buildingEngineering'], ['landscape'],
  ['janitorial', 'landscape'], ['buildingEngineering', 'janitorial'],
  ['facilitySolutions'], ['buildingEngineering', 'facilitySolutions'],
  ['buildingEngineering', 'facilitySolutions', 'janitorial'],
  ['janitorial', 'landscape', 'specialProjects'],
  ['buildingEngineering', 'facilitySolutions', 'janitorial', 'specialProjects', 'landscape'], // full service
  ['facilitySolutions', 'specialProjects'],
  ['buildingEngineering', 'janitorial', 'landscape'],
];
const FIRST_NAMES = [
  'Karen', 'Marcus', 'Priya', 'Devon', 'Renee', 'Adam', 'Lena', 'Colin', 'Sofia', 'Harold',
  'Maya', 'Trevor', 'Nadia', 'Julian', 'Simone', 'Derek', 'Ana', 'Wesley', 'Jasmine', 'Omar',
  'Christine', 'Bryan', 'Faith', 'Louis', 'Vanessa', 'Miguel', 'Erin', 'Nathaniel', 'Paula', 'Kenji',
  'Alicia', 'Grant', 'Yolanda', 'Ricardo', 'Beatrice', 'Ivan', 'Chloe', 'Malcolm', 'Rosa', 'Elliot',
];
const LAST_NAMES = [
  'Ibarra', 'Feld', 'Nair', 'Okafor', 'Castillo', 'Weiss', 'Truong', 'Marsh', 'Reyes', 'Bennett',
  'Donovan', 'Whitfield', 'Suzuki', 'Odom', 'Park', 'Alvarez', 'Chen', 'Brannigan', 'Osei', 'Hale',
  'Beaumont', 'Kessler', 'Ngo', 'Fitzgerald', 'Rowe', 'Delacroix', 'Mbeki', 'Farrow', 'Solis', 'Ashworth',
];
const JOB_TITLES = [
  'Property Manager', 'Senior Property Manager', 'Facilities Director', 'Facilities Manager',
  'Facilities Coordinator', 'Building Engineer', 'Operations Manager', 'Regional Manager',
  'Asset Manager', 'General Manager',
];

const STATUS_WEIGHTS = [
  ...Array(9).fill('active'),
  ...Array(4).fill('lead'),
  ...Array(3).fill('new_customer'),
  ...Array(4).fill('canceled'),
]; // ~45% active / 20% lead / 15% new_customer / 20% canceled

const TODAY = new Date('2026-08-26T00:00:00Z');
function daysAgo(n) {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysAgoIso(n) {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(randInt(14, 22), randInt(0, 59), 0, 0);
  return d.toISOString();
}
function daysAhead(n) {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function esc(s) {
  if (s === null || s === undefined) return 'null';
  if (typeof s === 'number') return String(s);
  return `'${String(s).replace(/'/g, "''")}'`;
}
function pgArray(arr) {
  return `ARRAY[${arr.map((s) => `'${s}'`).join(',')}]::text[]`;
}

const usedNames = new Set();
const rows = [];
const TOTAL = 190;

for (let i = 0; i < TOTAL; i++) {
  const c = pick(CITIES);
  const descriptor = pick(DESCRIPTORS);
  const bldgSuffix = rng() < 0.4 ? ` — Bldg ${randInt(1, 24)}` : '';
  let baseName = `${c.city} ${descriptor}`;
  let name = `${baseName}${bldgSuffix}`;
  let attempt = 0;
  while (usedNames.has(name)) {
    attempt++;
    name = `${baseName} ${String.fromCharCode(65 + attempt)}${bldgSuffix}`;
  }
  usedNames.add(name);

  const status = pick(STATUS_WEIGHTS);
  const services = pick(SERVICE_COMBOS);
  const isFullService = services.length === 5;

  const streetNum = randInt(100, 48999);
  const street = pick(STREET_NAMES);
  const suite = rng() < 0.5 ? `, Suite ${randInt(100, 950)}` : '';
  const address = `${streetNum} ${street}`;
  const jitter = () => (rng() - 0.5) * 0.03; // ~±1.5km scatter within the city
  const lat = +(c.lat + jitter()).toFixed(4);
  const lng = +(c.lng + jitter()).toFixed(4);

  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const salutation = pick(['Mr.', 'Ms.']);
  const jobTitle = pick(JOB_TITLES);
  const secondFirst = pick(FIRST_NAMES);
  const secondLast = pick(LAST_NAMES);
  const secondTitle = pick(['Assistant PM', 'Ops Manager', 'Chief Engineer', 'Leasing Manager', 'Maintenance Supervisor']);

  const domain = `${slugify(baseName)}.com`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
  const website = `https://www.${domain}`;
  const linkedin = `https://www.linkedin.com/company/${slugify(baseName)}`;

  const visitCount = status === 'lead' ? randInt(0, 2) : status === 'new_customer' ? randInt(1, 3) : status === 'canceled' ? randInt(3, 15) : randInt(4, 22);
  const lastVisitDaysAgo = randInt(3, 45);
  const cancelDaysAgo = randInt(20, 220);

  rows.push({
    account_name: name,
    account_notes: null,
    services,
    account_status: status,
    cancel_date: status === 'canceled' ? daysAgo(cancelDaysAgo) : null,
    billing_address: `${address}${suite}`, billing_city: c.city, billing_state: c.state, billing_zip: c.zip,
    route_address: address, route_city: c.city, route_state: c.state, route_zip: c.zip,
    latitude: lat, longitude: lng,
    salutation, first_name: firstName, last_name: lastName, job_title: jobTitle,
    secondary_contact: `${secondFirst} ${secondLast} (${secondTitle})`,
    main_phone: `${c.area}-555-${String(randInt(1000, 9999)).slice(0, 4)}`,
    alt_phone: `${c.area}-555-${String(randInt(1000, 9999)).slice(0, 4)}`,
    main_email: email, website, linkedin_url: linkedin,
    visit_count: visitCount,
    last_visit_date: visitCount > 0 ? daysAgo(lastVisitDaysAgo) : null,
    last_contacted_at: daysAgoIso(randInt(1, 40)),
    last_contacted_source: pick(['call', 'email', 'site visit']),
    next_follow_up_date: status === 'canceled' ? null : daysAhead(randInt(3, 30)),
  });
}

const cols = [
  'account_name', 'account_notes', 'services', 'account_status', 'cancel_date',
  'billing_address', 'billing_city', 'billing_state', 'billing_zip',
  'route_address', 'route_city', 'route_state', 'route_zip',
  'latitude', 'longitude',
  'salutation', 'first_name', 'last_name', 'job_title', 'secondary_contact',
  'main_phone', 'alt_phone', 'main_email', 'website', 'linkedin_url',
  'visit_count', 'last_visit_date', 'last_contacted_at', 'last_contacted_source', 'next_follow_up_date',
];

const valuesSql = rows.map((r) => {
  const vals = cols.map((col) => {
    if (col === 'services') return pgArray(r[col]);
    return esc(r[col]);
  });
  return `(${vals.join(', ')})`;
}).join(',\n');

console.log(`-- Generated ${rows.length} demo accounts (deterministic seed 20260826)`);
console.log(`insert into accounts (${cols.join(', ')}) values`);
console.log(valuesSql + ';');
