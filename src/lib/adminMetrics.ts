import type { BenefitFacility, GoogleRatingMatch } from '../types';
import { getPluxeeApproximateLocation } from './pluxeeApproximateLocations';
import { getFacilityFingerprint } from './ratingsApi';

export function buildMultiSportAdminStats(
  facilities: BenefitFacility[],
  ratings: Record<string, GoogleRatingMatch>,
) {
  const values = Object.values(ratings);
  const matched = values.filter((rating) => rating.matchStatus === 'matched').length;
  const withHours = values.filter(hasHours).length;
  const deltaFacilities = facilities.filter((facility) => needsDeltaRefresh(facility, ratings[facility.id]));
  const missingFacilities = facilities.filter((facility) => needsMissingRefresh(ratings[facility.id]));
  return {
    cached: values.length,
    matched,
    withHours,
    deltaFacilities,
    missingFacilities,
  };
}

export function buildPluxeeAdminStats(facilities: BenefitFacility[]) {
  const nativeLocationCount = facilities.filter((facility) => Number.isFinite(facility.lat) && Number.isFinite(facility.lng)).length;
  const googlePlaceIdCount = facilities.filter((facility) => Boolean(facility.googleMatch?.googlePlaceId)).length;
  const googleResolvedCount = facilities.filter((facility) => Boolean(facility.googleLocation)).length;
  const approximateLocationCount = facilities.filter((facility) => (
    !Number.isFinite(facility.lat)
    && !Number.isFinite(facility.lng)
    && !facility.googleLocation
    && Boolean(getPluxeeApproximateLocation(facility))
  )).length;
  const googlePendingCount = facilities.filter((facility) => (
    !Number.isFinite(facility.lat)
    && !Number.isFinite(facility.lng)
    && Boolean(facility.googleMatch?.googlePlaceId)
    && !facility.googleLocation
  )).length;
  const missingLocationCount = Math.max(facilities.length - nativeLocationCount - googleResolvedCount - googlePendingCount - approximateLocationCount, 0);

  return {
    total: facilities.length,
    nativeLocationCount,
    googlePlaceIdCount,
    googleResolvedCount,
    approximateLocationCount,
    googlePendingCount,
    missingLocationCount,
  };
}

export function needsDeltaRefresh(facility: BenefitFacility, rating?: GoogleRatingMatch): boolean {
  if (!rating) return true;
  return Boolean(rating.facilityFingerprint && rating.facilityFingerprint !== getFacilityFingerprint(facility));
}

export function needsMissingRefresh(rating?: GoogleRatingMatch): boolean {
  if (!rating) return true;
  if (rating.matchStatus === 'ambiguous' || rating.matchStatus === 'not_found' || rating.matchStatus === 'stale') return true;
  return rating.matchStatus === 'matched' && !hasHours(rating);
}

export function hasHours(rating: GoogleRatingMatch): boolean {
  return Boolean(rating.openingHours || rating.currentOpeningHours || rating.regularOpeningHours);
}
