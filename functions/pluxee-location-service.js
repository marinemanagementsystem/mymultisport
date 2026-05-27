const MAX_PLUXEE_LOCATION_BATCH = 50;
const PLUXEE_LOCATION_CACHE_DAYS = 30;
const PLUXEE_LOCATION_CACHE_MS = PLUXEE_LOCATION_CACHE_DAYS * 24 * 60 * 60 * 1000;

function sanitizePlaceIds(placeIds) {
  return Array.from(new Set((Array.isArray(placeIds) ? placeIds : [])
    .map((placeId) => String(placeId || '').trim())
    .filter(Boolean)))
    .slice(0, MAX_PLUXEE_LOCATION_BATCH);
}

function createPluxeeLocationCachePayload(placeId, location, now = new Date()) {
  const lat = Number(location?.latitude ?? location?.lat);
  const lng = Number(location?.longitude ?? location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const fetchedAt = now.toISOString();
  return {
    placeId,
    lat,
    lng,
    fetchedAt,
    expiresAt: new Date(now.getTime() + PLUXEE_LOCATION_CACHE_MS).toISOString(),
    source: 'google_places_details',
  };
}

function isFreshPluxeeLocationCache(payload, now = new Date()) {
  if (!payload) return false;
  if (!Number.isFinite(Number(payload.lat)) || !Number.isFinite(Number(payload.lng))) return false;
  const expiresAt = Date.parse(payload.expiresAt || '');
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

async function resolvePluxeeLocations({
  placeIds,
  now = new Date(),
  getCachedLocation,
  reserveQuota,
  fetchLocation,
  writeCachedLocation,
}) {
  const ids = sanitizePlaceIds(placeIds);
  const locations = [];
  const idsToFetch = [];

  for (const placeId of ids) {
    const cached = await getCachedLocation(placeId);
    if (isFreshPluxeeLocationCache(cached, now)) {
      locations.push(normalizeCachedLocation(cached));
      continue;
    }
    idsToFetch.push(placeId);
  }

  if (idsToFetch.length === 0) {
    return {
      locations,
      missingPlaceIds: [],
      pendingQuota: false,
      cacheHitCount: locations.length,
      googleLookupCount: 0,
    };
  }

  try {
    await reserveQuota(idsToFetch.length);
  } catch (error) {
    if (error?.code === 'pending_quota' || error?.statusCode === 429) {
      return {
        locations,
        missingPlaceIds: idsToFetch,
        pendingQuota: true,
        cacheHitCount: locations.length,
        googleLookupCount: 0,
      };
    }
    throw error;
  }

  const missingPlaceIds = [];
  for (const placeId of idsToFetch) {
    try {
      const location = await fetchLocation(placeId);
      const payload = createPluxeeLocationCachePayload(placeId, location, now);
      if (!payload) {
        missingPlaceIds.push(placeId);
        continue;
      }
      await writeCachedLocation(placeId, payload);
      locations.push(normalizeCachedLocation(payload));
    } catch {
      missingPlaceIds.push(placeId);
    }
  }

  return {
    locations,
    missingPlaceIds,
    pendingQuota: false,
    cacheHitCount: ids.length - idsToFetch.length,
    googleLookupCount: idsToFetch.length,
  };
}

function normalizeCachedLocation(payload) {
  return {
    placeId: payload.placeId,
    lat: Number(payload.lat),
    lng: Number(payload.lng),
    fetchedAt: payload.fetchedAt,
    expiresAt: payload.expiresAt,
    source: 'google_places_details',
  };
}

module.exports = {
  MAX_PLUXEE_LOCATION_BATCH,
  PLUXEE_LOCATION_CACHE_DAYS,
  createPluxeeLocationCachePayload,
  isFreshPluxeeLocationCache,
  resolvePluxeeLocations,
  sanitizePlaceIds,
};
