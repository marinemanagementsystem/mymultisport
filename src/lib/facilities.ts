import type {
  BenefitActivityGroup,
  BenefitFacility,
  FacilityResult,
  FilterState,
  GoogleRatingMatch,
  UserFacilityState,
  UserLocation,
} from '../types';

const BENEFIT_FACILITY_DETAIL_BASE = 'https://benefitsystems.com.tr/tesisler/';

const collator = new Intl.Collator('tr', { sensitivity: 'base' });

export async function loadFacilities(): Promise<BenefitFacility[]> {
  const response = await fetch('/data/facilities-tr.json', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Tesis listesi yüklenemedi (${response.status})`);
  }

  const facilities = (await response.json()) as BenefitFacility[];
  return facilities.filter(isUsableFacility);
}

export function isUsableFacility(facility: BenefitFacility): boolean {
  return (
    Boolean(facility.id) &&
    Boolean(facility.name) &&
    Number.isFinite(facility.lat) &&
    Number.isFinite(facility.lng)
  );
}

export function buildFacilityResults(
  facilities: BenefitFacility[],
  ratings: Record<string, GoogleRatingMatch>,
  userLocation?: UserLocation,
  userStates: Record<string, UserFacilityState> = {},
): FacilityResult[] {
  return facilities.map((facility) => ({
    facility,
    rating: ratings[facility.id],
    distanceKm: userLocation ? distanceKm(userLocation, facility) : undefined,
    userState: userStates[facility.id],
  }));
}

export function filterAndSortFacilities(results: FacilityResult[], filters: FilterState): FacilityResult[] {
  const query = normalize(filters.query);
  const city = normalize(filters.city);
  const district = normalize(filters.district);
  const activity = normalize(filters.activity);

  const filtered = results.filter((result) => {
    const { facility, rating, distanceKm: distance } = result;
    if (city && normalize(facility.city) !== city) return false;
    if (district && normalize(facility.cityDistrict) !== district) return false;
    if (activity && !getActivityNames(facility.activityGroups).some((name) => normalize(name) === activity)) {
      return false;
    }
    if (query && !searchText(facility).includes(query)) return false;
    if (filters.card && !facility.cards.some((card) => normalize(card) === normalize(filters.card))) return false;
    if (filters.amenity && !facility.amenities.some((amenity) => normalize(amenity) === normalize(filters.amenity))) return false;
    if (filters.hasPhoto && !facility.thumbnail) return false;
    if (filters.activeOnly && facility.status !== 1) return false;
    if (filters.internationalOnly && !facility.allowInternationalVisits) return false;
    if (filters.personal === 'favorite' && !result.userState?.favorite) return false;
    if (filters.personal === 'wantToGo' && !result.userState?.wantToGo) return false;
    if (filters.personal === 'visited' && !result.userState?.visited) return false;
    if (filters.personal === 'noted' && !result.userState?.note.trim()) return false;
    if (filters.radiusKm > 0 && distance !== undefined && distance > filters.radiusKm) return false;
    if (filters.minRating > 0 && (rating?.matchStatus !== 'matched' || (rating.rating ?? 0) < filters.minRating)) {
      return false;
    }
    if (filters.minReviews > 0 && (rating?.matchStatus !== 'matched' || (rating.userRatingCount ?? 0) < filters.minReviews)) {
      return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === 'recommended') {
      return recommendedScore(b, filters) - recommendedScore(a, filters)
        || collator.compare(a.facility.name, b.facility.name);
    }
    if (filters.sort === 'distance') {
      return (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER);
    }
    if (filters.sort === 'rating_desc') {
      return compareRating(b, a) || collator.compare(a.facility.name, b.facility.name);
    }
    if (filters.sort === 'reviews_desc') {
      return (b.rating?.userRatingCount ?? -1) - (a.rating?.userRatingCount ?? -1) || compareRating(b, a);
    }
    return collator.compare(a.facility.name, b.facility.name);
  });
}

function compareRating(a: FacilityResult, b: FacilityResult): number {
  return (a.rating?.rating ?? -1) - (b.rating?.rating ?? -1)
    || (a.rating?.userRatingCount ?? -1) - (b.rating?.userRatingCount ?? -1);
}

function recommendedScore(result: FacilityResult, filters: FilterState): number {
  const { facility, rating, distanceKm: distance, userState } = result;
  const ratingScore = rating?.matchStatus === 'matched' ? ((rating.rating ?? 0) / 5) * 38 : 6;
  const reviewCount = rating?.matchStatus === 'matched' ? rating.userRatingCount ?? 0 : 0;
  const reviewScore = Math.min(Math.log10(reviewCount + 1) / Math.log10(1200), 1) * 18;
  const distanceScore = distance === undefined ? 8 : Math.max(0, 28 - distance * 1.4);
  const activityScore = filters.activity
    && getActivityNames(facility.activityGroups).some((name) => normalize(name) === normalize(filters.activity))
    ? 8
    : 0;
  const freshnessScore = facility.thumbnail ? 4 : 0;
  const activeScore = facility.status === 1 ? 4 : -18;
  const cardScore = filters.card && facility.cards.some((card) => normalize(card) === normalize(filters.card)) ? 4 : 0;
  const personalScore = (userState?.favorite ? 2 : 0) + (userState?.wantToGo ? 1.5 : 0) + (userState?.visited ? 1 : 0);
  return ratingScore + reviewScore + distanceScore + activityScore + freshnessScore + activeScore + cardScore + personalScore;
}

export function getActivityNames(groups: BenefitActivityGroup[] = []): string[] {
  const names = new Set<string>();
  groups.forEach((group) => group.activities?.forEach((activity) => names.add(activity.name)));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getPrimaryActivities(facility: BenefitFacility, limit = 3): string[] {
  return getActivityNames(facility.activityGroups).slice(0, limit);
}

export function getPrimaryAmenities(facility: BenefitFacility, limit = 3): string[] {
  return (facility.amenities || []).filter(Boolean).slice(0, limit);
}

export function getUniqueCities(facilities: BenefitFacility[]): string[] {
  return Array.from(new Set(facilities.map((facility) => facility.city).filter(Boolean)))
    .sort((a, b) => collator.compare(a, b));
}

export function getUniqueDistricts(facilities: BenefitFacility[], city: string): string[] {
  const normalizedCity = normalize(city);
  return Array.from(new Set(
    facilities
      .filter((facility) => !normalizedCity || normalize(facility.city) === normalizedCity)
      .map((facility) => facility.cityDistrict)
      .filter(Boolean),
  )).sort((a, b) => collator.compare(a, b));
}

export function getUniqueActivities(facilities: BenefitFacility[]): string[] {
  const names = new Set<string>();
  facilities.forEach((facility) => getActivityNames(facility.activityGroups).forEach((name) => names.add(name)));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getUniqueAmenities(facilities: BenefitFacility[]): string[] {
  const names = new Set<string>();
  facilities.forEach((facility) => facility.amenities?.forEach((amenity) => {
    if (amenity) names.add(amenity);
  }));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getUniqueCards(facilities: BenefitFacility[]): string[] {
  const names = new Set<string>();
  facilities.forEach((facility) => facility.cards?.forEach((card) => {
    if (card) names.add(card);
  }));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getFacilityDetailUrl(facility: BenefitFacility): string {
  return new URL(facility.slug, BENEFIT_FACILITY_DETAIL_BASE).toString();
}

export function getGoogleMapsSearchUrl(facility: BenefitFacility): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${facility.lat},${facility.lng}`)}`;
}

export function normalize(value: string | undefined | null): string {
  return (value || '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchText(facility: BenefitFacility): string {
  return normalize([
    facility.name,
    facility.city,
    facility.cityDistrict,
    facility.address,
    ...getActivityNames(facility.activityGroups),
    ...facility.amenities,
    ...facility.discounts,
    ...facility.cards,
  ].join(' '));
}

export function distanceKm(from: UserLocation, to: Pick<BenefitFacility, 'lat' | 'lng'>): number {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(to.lat - from.lat);
  const dLng = degreesToRadians(to.lng - from.lng);
  const lat1 = degreesToRadians(from.lat);
  const lat2 = degreesToRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}
