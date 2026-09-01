// Account data schema for Encore.
// Source of truth for account/CRM data is HubSpot; this table is the
// map-optimized read/write layer the app actually queries against.

export type AccountStatus = 'lead' | 'active' | 'canceled' | 'new_customer';

export type ServiceType =
  | 'buildingEngineering'
  | 'facilitySolutions'
  | 'janitorial'
  | 'specialProjects'
  | 'landscape';

export const ALL_SERVICE_TYPES: ServiceType[] = [
  'buildingEngineering',
  'facilitySolutions',
  'janitorial',
  'specialProjects',
  'landscape',
];

export function isFullService(services: ServiceType[]): boolean {
  return ALL_SERVICE_TYPES.every((s) => services.includes(s));
}

export interface Account {
  id: string;

  // Identity
  accountName: string;          // Property/company name / HubSpot Company name
  accountNotes?: string;        // Free-text notes

  // Services (multi-select). "Full Service" is derived via isFullService(), not stored.
  services: ServiceType[];

  // Tag ids from the shared, user-created tags taxonomy (see useTags.ts).
  // Populated via a bulk account_tags join in useAccounts, not its own column.
  tags: string[];

  // Status
  accountStatus: AccountStatus;
  cancelDate?: string | null;   // no source data on import; set manually going forward

  // Two distinct addresses — billing vs. the property/job site the rep actually drives to
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  routeAddress?: string;
  routeCity?: string;
  routeState?: string;
  routeZip?: string;

  // Map coordinates — geocoded from the route (job-site) address
  latitude: number;
  longitude: number;

  // Contact — many accounts only have a subset filled in (company +
  // email/phone, no named person), so nothing here should be assumed present.
  salutation?: string;          // "Mr./Ms./..."
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  primaryContact?: string;      // Free-text "Primary Contact" field
  secondaryContact?: string;
  jobTitle?: string;
  mainPhone?: string;
  altPhone?: string;
  fax?: string;
  mainEmail?: string;
  linkedinUrl?: string;
  website?: string;

  // Activity
  visitCount: number;
  lastVisitDate?: string;
  nextFollowUpDate?: string;
  lastContactedAt?: string | null;
  lastContactedSource?: string | null;

  // HubSpot sync (mirrors the account_id-on-CRM-object pattern)
  hubspotCompanyId?: string;
  hubspotContactId?: string;

  // Transient preview flag set when this Account came from an Around Me POI
  // and has NOT been persisted to the database yet. Used by AccountDrawer to
  // defer account creation until the rep logs an event.
  isAroundMePreview?: boolean;
  aroundMeSourceId?: string;
}

export interface RouteStopRecord {
  accountId: string;
  order: number;
  estimatedArrival?: string;
  completed: boolean;
}

export interface Route {
  id: string;
  name: string;
  stops: RouteStopRecord[];
  totalDistance?: number;
  estimatedDuration?: number;
  createdAt: string;
}

// Status display configuration
export const statusConfig: Record<AccountStatus, {
  label: string;
  color: string;
  bgClass: string;
  description: string;
}> = {
  lead: {
    label: 'Lead',
    color: '#4FC3F7',
    bgClass: 'status-badge-lead',
    description: 'Go Get — new prospects, not yet a customer',
  },
  active: {
    label: 'Active',
    color: '#00F0B5',
    bgClass: 'status-badge-active',
    description: 'Keep — current customer with at least one active service',
  },
  canceled: {
    label: 'Win back',
    color: '#FF5C5C',
    bgClass: 'status-badge-canceled',
    description: 'Win Back — former customer, a win-back candidate',
  },
  new_customer: {
    label: 'New Customer',
    color: '#FBBF24',
    bgClass: 'status-badge-new-customer',
    description: 'Closed this year',
  },
};

export const serviceConfig: Record<ServiceType, { label: string; color: string }> = {
  buildingEngineering: { label: 'Building Engineering', color: '#455A64' },
  facilitySolutions: { label: 'Facility Solutions', color: '#00897B' },
  janitorial: { label: 'Janitorial', color: '#5E35B1' },
  specialProjects: { label: 'Special Projects', color: '#F9A825' },
  landscape: { label: 'Landscape', color: '#43A047' },
};

export const FULL_SERVICE_CONFIG = { label: 'Full Service', color: '#8E9B98' };

// Prospect categories for "Around Me" — commercial property types worth
// prospecting for facility maintenance (replaces Smart Route's B2B "Industry" concept).
export type ProspectCategory =
  | 'officeBuilding'
  | 'retailCenter'
  | 'apartment'
  | 'industrial'
  | 'medical'
  | 'hospitality'
  | 'mixedUse'
  | 'other';

export const prospectCategoryLabels: Record<ProspectCategory, string> = {
  officeBuilding: 'Office Building',
  retailCenter: 'Retail Center',
  apartment: 'Apartment / Multifamily',
  industrial: 'Industrial / Warehouse',
  medical: 'Medical / Healthcare',
  hospitality: 'Hotel / Hospitality',
  mixedUse: 'Mixed-Use Property',
  other: 'Other',
};
