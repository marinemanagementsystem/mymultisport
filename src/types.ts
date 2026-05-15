export type MatchStatus = 'matched' | 'ambiguous' | 'not_found' | 'stale';

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
}

export interface GoogleRatingMatch {
  facilityId: string;
  placeId?: string;
  displayName?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  location?: {
    lat: number;
    lng: number;
  };
  matchStatus: MatchStatus;
  matchScore?: number;
  distanceMeters?: number;
  updatedAt?: string;
  error?: string;
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
  newFacilities: FacilityChangeItem[];
  removedFacilities: FacilityChangeItem[];
  updatedFacilities: FacilityUpdatedChange[];
}
