export type MatchStatus = 'matched' | 'ambiguous' | 'not_found' | 'stale';
export type HoursFilterMode = '' | 'open_now' | 'closed_now' | 'open_at' | 'open_until' | 'open_between';

export interface BenefitActivity {
  name: string;
}

export interface BenefitActivityGroup {
  name: string;
  activities: BenefitActivity[];
}

export interface BenefitFacility {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  thumbnail?: string;
  address: string;
  city: string;
  cityDistrict: string;
  activityGroups: BenefitActivityGroup[];
  discounts: string[];
  amenities: string[];
  cards: string[];
  status: number;
  desired: boolean;
  vcOnly: boolean;
  allowInternationalVisits: boolean;
  sourceStatus?: 'current' | 'historical';
}

export interface GoogleRatingMatch {
  facilityId: string;
  placeId?: string;
  displayName?: string;
  formattedAddress?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  openingHours?: GoogleOpeningHours;
  currentOpeningHours?: GoogleOpeningHours;
  regularOpeningHours?: GoogleOpeningHours;
  utcOffsetMinutes?: number;
  location?: {
    lat: number;
    lng: number;
  };
  matchStatus: MatchStatus;
  matchScore?: number;
  distanceMeters?: number;
  updatedAt?: string;
  googleFetchedAt?: string;
  cacheUpdatedAt?: string;
  snapshotUpdatedAt?: string;
  facilityFingerprint?: string;
  refreshReason?: string;
  error?: string;
}

export interface RatingsSnapshotMeta {
  rebuiltAt?: string;
  shardCount: number;
  ratingCount: number;
  matchedCount: number;
  hoursCount: number;
}

export interface RatingsSnapshotResponse {
  meta: RatingsSnapshotMeta;
  ratings: GoogleRatingMatch[];
}

export interface AdminUsageCounter {
  count: number;
  limit: number;
  updatedAt?: string;
}

export interface AdminRatingsStatus {
  usage: {
    daily: AdminUsageCounter;
    monthly: AdminUsageCounter;
  };
  limits: {
    batch: number;
    daily: number;
    monthly: number;
    snapshotShards: number;
  };
  snapshot: RatingsSnapshotMeta | null;
  time: string;
}

export interface GoogleOpeningHours {
  openNow?: boolean;
  nextCloseTime?: string;
  nextOpenTime?: string;
  weekdayDescriptions?: string[];
  periods?: GoogleOpeningPeriod[];
  timeZone?: string;
  utcOffsetMinutes?: number;
}

export interface GoogleOpeningPeriod {
  open?: GoogleOpeningPoint;
  close?: GoogleOpeningPoint;
}

export interface GoogleOpeningPoint {
  day?: number;
  hour?: number;
  minute?: number;
}

export interface FacilityResult {
  facility: BenefitFacility;
  rating?: GoogleRatingMatch;
  distanceKm?: number;
  userState?: UserFacilityState;
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export type FacilityPersonalKey = 'favorite' | 'wantToGo' | 'visited';
export type PersonalFilter = '' | FacilityPersonalKey | 'noted';

export interface UserFacilityState {
  facilityId: string;
  favorite: boolean;
  wantToGo: boolean;
  visited: boolean;
  note: string;
  updatedAt: string;
}

export interface FilterState {
  query: string;
  city: string;
  district: string;
  activity: string;
  sort: 'recommended' | 'distance' | 'rating_desc' | 'reviews_desc' | 'az';
  minRating: number;
  minReviews: number;
  radiusKm: number;
  hoursMode: HoursFilterMode;
  hoursTime: string;
  hoursEndTime: string;
  card: string;
  amenity: string;
  personal: PersonalFilter;
  hasPhoto: boolean;
  activeOnly: boolean;
  internationalOnly: boolean;
}

export interface FacilityStats {
  total: number;
  shown: number;
  matched: number;
  pending: number;
  favorites: number;
  wantToGo: number;
  visited: number;
}

export interface FacilityChangeItem {
  id: string;
  name: string;
  city: string;
  cityDistrict: string;
  cards: string[];
  activities: string[];
}

export interface FacilityUpdatedChange extends FacilityChangeItem {
  changedFields: string[];
}

export interface FacilityChangeSummary {
  generatedAt: string;
  sourceUrl: string;
  previousCount: number;
  currentCount: number;
  publicSourceCount?: number;
  historicalCount?: number;
  newFacilities: FacilityChangeItem[];
  removedFacilities: FacilityChangeItem[];
  historicalFacilities?: FacilityChangeItem[];
  updatedFacilities: FacilityUpdatedChange[];
}

export type { LanguageCode } from './lib/i18n';
