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
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export interface FilterState {
  query: string;
  city: string;
  district: string;
  activity: string;
  sort: 'distance' | 'rating_desc' | 'reviews_desc' | 'az';
  minRating: number;
  minReviews: number;
  radiusKm: number;
}

export interface FacilityStats {
  total: number;
  shown: number;
  matched: number;
  pending: number;
}
