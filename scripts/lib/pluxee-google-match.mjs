import { fingerprintPluxeePlace } from './pluxee-import.mjs';

export function buildPluxeeGoogleQuery(place) {
  return [
    place.name,
    place.address,
    place.neighborhood,
    place.cityDistrict,
    place.city,
    'Türkiye',
  ].filter(Boolean).join(', ');
}

export function sanitizeIdOnlyPlaceSearch(payload) {
  const candidatePlaceIds = Array.from(new Set(
    (payload?.places || [])
      .map((place) => typeof place?.id === 'string' ? place.id : '')
      .filter(Boolean),
  ));
  return { candidatePlaceIds };
}

export function buildIdOnlyPluxeeMatch(place, queryUsed, search, matchedAt = new Date().toISOString()) {
  const candidatePlaceIds = Array.isArray(search?.candidatePlaceIds) ? search.candidatePlaceIds : [];
  const googlePlaceId = candidatePlaceIds[0];
  return removeUndefined({
    facilityId: place.id,
    googlePlaceId,
    candidatePlaceIds,
    matchStatus: googlePlaceId ? 'matched' : 'not_found',
    matchedAt,
    pluxeeFingerprint: place.fingerprint || fingerprintPluxeePlace(place),
    queryUsed,
  });
}

export function isReusablePluxeeMatch(place, match) {
  if (!place || !match) return false;
  if (match.facilityId !== place.id) return false;
  if (match.pluxeeFingerprint !== (place.fingerprint || fingerprintPluxeePlace(place))) return false;
  return match.matchStatus === 'matched' && Boolean(match.googlePlaceId);
}

export async function searchPluxeePlaceIds({ apiKey, place, fetchImpl = fetch }) {
  const queryUsed = buildPluxeeGoogleQuery(place);
  const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id',
    },
    body: JSON.stringify({
      textQuery: queryUsed,
      languageCode: 'tr',
      regionCode: 'TR',
      maxResultCount: 5,
    }),
  });

  if (!response.ok) {
    return {
      queryUsed,
      error: `places_api_${response.status}`,
      search: { candidatePlaceIds: [] },
    };
  }

  return {
    queryUsed,
    search: sanitizeIdOnlyPlaceSearch(await response.json()),
  };
}

function removeUndefined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
