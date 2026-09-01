// One-time seed script: inserts 10 fictional commercial-property accounts for
// the M5 Services demo (no real customer database exists yet). Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-accounts.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Bay Area coordinates near real landmarks (M5 HQ: Pleasanton, CA) — hand-picked
// rather than geocoded, since these are fictional addresses. Every field on
// the Account type is filled in (billing, secondary contact, website,
// LinkedIn, activity history, etc.) so the demo doesn't show blank fields.
const accounts = [
  {
    account_name: 'Hacienda Business Park — Bldg 4',
    account_notes: '4-story Class A office building, ~180k sq ft. Owned by a regional REIT; PM is on-site three days a week.',
    services: ['buildingEngineering', 'janitorial'],
    account_status: 'active',
    billing_address: '4690 Chabot Dr, Suite 200', billing_city: 'Pleasanton', billing_state: 'CA', billing_zip: '94588',
    route_address: '4690 Chabot Dr', route_city: 'Pleasanton', route_state: 'CA', route_zip: '94588',
    latitude: 37.6935, longitude: -121.9269,
    salutation: 'Ms.', first_name: 'Karen', last_name: 'Ibarra', job_title: 'Property Manager',
    secondary_contact: 'Frank Delgado (Assistant PM)',
    main_phone: '925-555-0142', alt_phone: '925-555-0143', fax: '925-555-0144',
    main_email: 'karen.ibarra@haciendabusinesspark.com',
    website: 'https://www.haciendabusinesspark.com', linkedin_url: 'https://www.linkedin.com/company/hacienda-business-park',
    visit_count: 6, last_visit_date: '2026-07-28', last_contacted_at: '2026-08-02T18:00:00Z', last_contacted_source: 'site visit',
    next_follow_up_date: '2026-08-20',
  },
  {
    account_name: 'Dublin Corporate Center',
    account_notes: 'Full-service flagship account — multi-building corporate campus, highly visible referral source in the Tri-Valley.',
    services: ['buildingEngineering', 'facilitySolutions', 'janitorial', 'specialProjects', 'landscape'],
    account_status: 'active',
    billing_address: '4225 Hacienda Dr', billing_city: 'Dublin', billing_state: 'CA', billing_zip: '94568',
    route_address: '4225 Hacienda Dr', route_city: 'Dublin', route_state: 'CA', route_zip: '94568',
    latitude: 37.7022, longitude: -121.9358,
    salutation: 'Mr.', first_name: 'Marcus', last_name: 'Feld', job_title: 'Facilities Director',
    secondary_contact: 'Grace Lin (Ops Manager)',
    main_phone: '925-555-0198', alt_phone: '925-555-0199', fax: '925-555-0100',
    main_email: 'marcus.feld@dublincorporatecenter.com',
    website: 'https://www.dublincorporatecenter.com', linkedin_url: 'https://www.linkedin.com/company/dublin-corporate-center',
    visit_count: 14, last_visit_date: '2026-08-01', last_contacted_at: '2026-08-04T16:30:00Z', last_contacted_source: 'call',
    next_follow_up_date: '2026-08-15',
  },
  {
    account_name: 'Bishop Ranch Tech Campus — Bldg 12',
    account_notes: 'Prospect from a referral at a facilities-management trade show. Currently self-performing engineering in-house.',
    services: ['facilitySolutions'],
    account_status: 'lead',
    billing_address: '2600 Camino Ramon', billing_city: 'San Ramon', billing_state: 'CA', billing_zip: '94583',
    route_address: '2600 Camino Ramon', route_city: 'San Ramon', route_state: 'CA', route_zip: '94583',
    latitude: 37.7799, longitude: -121.9569,
    salutation: 'Ms.', first_name: 'Priya', last_name: 'Nair', job_title: 'Property Manager',
    secondary_contact: 'Tom Alvarez (Regional Manager)',
    main_phone: '925-555-0176', alt_phone: '925-555-0177', fax: '925-555-0178',
    main_email: 'priya.nair@bishopranchtech.com',
    website: 'https://www.bishopranchtech.com', linkedin_url: 'https://www.linkedin.com/company/bishop-ranch-tech-campus',
    visit_count: 1, last_visit_date: '2026-07-15', last_contacted_at: '2026-07-30T20:00:00Z', last_contacted_source: 'email',
    next_follow_up_date: '2026-08-12',
  },
  {
    account_name: 'Walnut Creek Corporate Plaza',
    account_notes: 'Signed last month after a competitive RFP against two incumbent janitorial vendors.',
    services: ['janitorial', 'landscape'],
    account_status: 'new_customer',
    billing_address: '1990 N California Blvd, Suite 20', billing_city: 'Walnut Creek', billing_state: 'CA', billing_zip: '94596',
    route_address: '1990 N California Blvd', route_city: 'Walnut Creek', route_state: 'CA', route_zip: '94596',
    latitude: 37.9101, longitude: -122.0652,
    salutation: 'Mr.', first_name: 'Devon', last_name: 'Okafor', job_title: 'Building Engineer',
    secondary_contact: 'Michelle Park (Leasing Manager)',
    main_phone: '925-555-0113', alt_phone: '925-555-0114', fax: '925-555-0115',
    main_email: 'devon.okafor@walnutcreekplaza.com',
    website: 'https://www.walnutcreekplaza.com', linkedin_url: 'https://www.linkedin.com/company/walnut-creek-corporate-plaza',
    visit_count: 2, last_visit_date: '2026-07-22', last_contacted_at: '2026-08-01T17:00:00Z', last_contacted_source: 'site visit',
    next_follow_up_date: '2026-08-18',
  },
  {
    account_name: 'Oakland Uptown Plaza',
    account_notes: 'Mixed office/retail podium building. Engineering + special-projects work is seasonal around tenant turnovers.',
    services: ['buildingEngineering', 'facilitySolutions', 'specialProjects'],
    account_status: 'active',
    billing_address: '2101 Webster St, 5th Floor', billing_city: 'Oakland', billing_state: 'CA', billing_zip: '94612',
    route_address: '2101 Webster St', route_city: 'Oakland', route_state: 'CA', route_zip: '94612',
    latitude: 37.8095, longitude: -122.2665,
    salutation: 'Ms.', first_name: 'Renee', last_name: 'Castillo', job_title: 'Facilities Manager',
    secondary_contact: 'Julian Osei (Chief Engineer)',
    main_phone: '510-555-0164', alt_phone: '510-555-0165', fax: '510-555-0166',
    main_email: 'renee.castillo@oaklanduptownplaza.com',
    website: 'https://www.oaklanduptownplaza.com', linkedin_url: 'https://www.linkedin.com/company/oakland-uptown-plaza',
    visit_count: 9, last_visit_date: '2026-07-30', last_contacted_at: '2026-08-03T15:00:00Z', last_contacted_source: 'call',
    next_follow_up_date: '2026-08-22',
  },
  {
    account_name: 'SoMa Tech Lofts — 2nd St',
    account_notes: 'Canceled after the anchor tenant downsized and building went to skeleton-crew management. Revisit if occupancy recovers.',
    services: ['janitorial'],
    account_status: 'canceled',
    cancel_date: '2026-04-30',
    billing_address: '650 2nd St, Suite 100', billing_city: 'San Francisco', billing_state: 'CA', billing_zip: '94107',
    route_address: '650 2nd St', route_city: 'San Francisco', route_state: 'CA', route_zip: '94107',
    latitude: 37.7825, longitude: -122.3931,
    salutation: 'Mr.', first_name: 'Adam', last_name: 'Weiss', job_title: 'Property Manager',
    secondary_contact: 'Nora Kim (former Ops Lead)',
    main_phone: '415-555-0129', alt_phone: '415-555-0130', fax: '415-555-0131',
    main_email: 'adam.weiss@somatechlofts.com',
    website: 'https://www.somatechlofts.com', linkedin_url: 'https://www.linkedin.com/company/soma-tech-lofts',
    visit_count: 11, last_visit_date: '2026-04-25', last_contacted_at: '2026-05-02T19:00:00Z', last_contacted_source: 'email',
  },
  {
    account_name: 'Downtown San Jose Financial Center',
    account_notes: 'Largest full-service account in the South Bay — high-rise Class A office tower with ground-floor retail.',
    services: ['buildingEngineering', 'facilitySolutions', 'janitorial', 'specialProjects', 'landscape'],
    account_status: 'active',
    billing_address: '111 W St John St, Suite 900', billing_city: 'San Jose', billing_state: 'CA', billing_zip: '95113',
    route_address: '111 W St John St', route_city: 'San Jose', route_state: 'CA', route_zip: '95113',
    latitude: 37.3372, longitude: -121.8908,
    salutation: 'Ms.', first_name: 'Lena', last_name: 'Truong', job_title: 'Senior Property Manager',
    secondary_contact: 'Victor Salas (Building Engineer Lead)',
    main_phone: '408-555-0187', alt_phone: '408-555-0188', fax: '408-555-0189',
    main_email: 'lena.truong@dtsjfinancial.com',
    website: 'https://www.dtsjfinancial.com', linkedin_url: 'https://www.linkedin.com/company/downtown-san-jose-financial-center',
    visit_count: 20, last_visit_date: '2026-08-04', last_contacted_at: '2026-08-05T14:00:00Z', last_contacted_source: 'site visit',
    next_follow_up_date: '2026-08-19',
  },
  {
    account_name: 'Fremont Innovation Park — Bldg B',
    account_notes: 'New biotech/light-industrial park still leasing up. Landscape + special-projects scope only for now, engineering TBD.',
    services: ['landscape', 'specialProjects'],
    account_status: 'lead',
    billing_address: '48001 Warm Springs Blvd', billing_city: 'Fremont', billing_state: 'CA', billing_zip: '94539',
    route_address: '48001 Warm Springs Blvd', route_city: 'Fremont', route_state: 'CA', route_zip: '94539',
    latitude: 37.5081, longitude: -121.9440,
    salutation: 'Mr.', first_name: 'Colin', last_name: 'Marsh', job_title: 'Facilities Coordinator',
    secondary_contact: 'Amara Singh (Development Manager)',
    main_phone: '510-555-0155', alt_phone: '510-555-0156', fax: '510-555-0157',
    main_email: 'colin.marsh@fremontinnovationpark.com',
    website: 'https://www.fremontinnovationpark.com', linkedin_url: 'https://www.linkedin.com/company/fremont-innovation-park',
    visit_count: 0, last_contacted_at: '2026-07-28T21:00:00Z', last_contacted_source: 'email',
    next_follow_up_date: '2026-08-14',
  },
  {
    account_name: 'Livermore Business Center',
    account_notes: 'Single-building light-industrial account, just onboarded — engineering scope only, may expand to janitorial in Q4.',
    services: ['buildingEngineering'],
    account_status: 'new_customer',
    billing_address: '1450 Airway Blvd', billing_city: 'Livermore', billing_state: 'CA', billing_zip: '94551',
    route_address: '1450 Airway Blvd', route_city: 'Livermore', route_state: 'CA', route_zip: '94551',
    latitude: 37.6819, longitude: -121.7680,
    salutation: 'Ms.', first_name: 'Sofia', last_name: 'Reyes', job_title: 'Property Manager',
    secondary_contact: 'Ben Holt (Maintenance Supervisor)',
    main_phone: '925-555-0121', alt_phone: '925-555-0122', fax: '925-555-0123',
    main_email: 'sofia.reyes@livermorebusinesscenter.com',
    website: 'https://www.livermorebusinesscenter.com', linkedin_url: 'https://www.linkedin.com/company/livermore-business-center',
    visit_count: 1, last_visit_date: '2026-08-01', last_contacted_at: '2026-08-04T18:00:00Z', last_contacted_source: 'call',
    next_follow_up_date: '2026-08-25',
  },
  {
    account_name: 'Concord Gateway Office Park',
    account_notes: 'Canceled when ownership changed hands; new owner brought in their own preferred vendor. Worth a win-back call next renewal cycle.',
    services: ['janitorial', 'landscape'],
    account_status: 'canceled',
    cancel_date: '2026-02-15',
    billing_address: '1990 Diamond Blvd, Suite 300', billing_city: 'Concord', billing_state: 'CA', billing_zip: '94520',
    route_address: '1990 Diamond Blvd', route_city: 'Concord', route_state: 'CA', route_zip: '94520',
    latitude: 37.9780, longitude: -122.0311,
    salutation: 'Mr.', first_name: 'Harold', last_name: 'Bennett', job_title: 'Facilities Director',
    secondary_contact: 'Diane Foster (former Property Manager)',
    main_phone: '925-555-0139', alt_phone: '925-555-0140', fax: '925-555-0141',
    main_email: 'harold.bennett@concordgatewaypark.com',
    website: 'https://www.concordgatewaypark.com', linkedin_url: 'https://www.linkedin.com/company/concord-gateway-office-park',
    visit_count: 8, last_visit_date: '2026-02-10', last_contacted_at: '2026-02-16T16:00:00Z', last_contacted_source: 'call',
  },
];

const { data, error } = await supabase.from('accounts').insert(accounts).select('id, account_name');
if (error) {
  console.error('Seed failed:', error);
  process.exit(1);
}
console.log(`Inserted ${data.length} demo accounts:`);
data.forEach((a) => console.log(`  - ${a.account_name} (${a.id})`));
