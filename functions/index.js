const { setGlobalOptions } = require('firebase-functions/v2');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const GOOGLE_MAPS_PLATFORM_KEY = defineSecret('GOOGLE_MAPS_PLATFORM_KEY');
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const CACHE_COLLECTION = 'googleRatingMatches';
const DAILY_USAGE_COLLECTION = 'googlePlacesDailyUsage';
const BENEFIT_SOURCE_URL = 'https://benefitsystems.com.tr/facilities-tr.json';
const MATCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BATCH = 100;
const DAILY_ENRICH_LIMIT = Number(process.env.DAILY_ENRICH_LIMIT || 1000);

exports.api = onRequest({ secrets: [GOOGLE_MAPS_PLATFORM_KEY], cors: true }, async (req, res) => {
  try {
    const path = new URL(req.url, 'https://mymultisport.local').pathname.replace(/^\/api/, '') || '/';

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method === 'GET' && path === '/health') {
      res.json({
        ok: true,
        project: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown',
        region: 'europe-west1',
        time: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'GET' && path === '/ratings') {
      await handleGetRatings(req, res);
      return;
    }

    if (req.method === 'POST' && path === '/ratings/enrich') {
      await handleEnrichRatings(req, res);
      return;
    }

    res.status(404).json({ error: 'not_found' });
  } catch (error) {
    logger.error('Unhandled API error', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'internal_error',
      message: error.message || String(error),
    });
  }
});

async function handleGetRatings(req, res) {
  const ids = parseIds(req.query.ids);
  if (ids.length === 0) {
    res.json({ ratings: [] });
    return;
  }
  if (ids.length > MAX_BATCH) {
    res.status(400).json({ error: 'too_many_ids', max: MAX_BATCH });
    return;
  }

  const snapshots = await Promise.all(ids.map((id) => db.collection(CACHE_COLLECTION).doc(id).get()));
  const ratings = snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => markStaleIfNeeded(snapshot.data()));

  res.json({ ratings });
}

async function handleEnrichRatings(req, res) {
  const facilities = await resolveFacilitiesFromRequest(req.body || {});
  if (facilities.length === 0) {
    res.status(400).json({ error: 'no_facilities' });
    return;
  }
  if (facilities.length > MAX_BATCH) {
    res.status(400).json({ error: 'too_many_facilities', max: MAX_BATCH });
    return;
  }

  const ratings = [];
  let googleLookupCount = 0;
  for (const facility of facilities) {
    const docRef = db.collection(CACHE_COLLECTION).doc(facility.id);
    const snapshot = await docRef.get();
    if (snapshot.exists) {
      const cached = markStaleIfNeeded(snapshot.data());
      if (cached.matchStatus !== 'stale' && hasExpectedCachedFields(cached)) {
        ratings.push(cached);
        continue;
      }
    }

    await assertDailyQuota(googleLookupCount + 1);
    const rating = await findGoogleRating(facility);
    googleLookupCount += 1;
    await docRef.set(rating);
    ratings.push(rating);
  }

  await incrementDailyUsage(googleLookupCount);
  res.json({ ratings });
}

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH + 1);
}

async function resolveFacilitiesFromRequest(body) {
  if (Array.isArray(body.facilities)) {
    return body.facilities.filter(isFacilityPayload).slice(0, MAX_BATCH + 1);
  }

  const ids = Array.isArray(body.facilityIds) ? body.facilityIds : [];
  if (ids.length === 0) return [];

  const response = await fetch(BENEFIT_SOURCE_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Benefit Systems data fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const byId = new Map(data.map((facility) => [facility.id, facility]));
  return ids.map((id) => byId.get(id)).filter(isFacilityPayload).slice(0, MAX_BATCH + 1);
}

function isFacilityPayload(facility) {
  return facility
    && typeof facility.id === 'string'
    && typeof facility.name === 'string'
    && typeof facility.city === 'string'
    && Number.isFinite(Number(facility.lat))
    && Number.isFinite(Number(facility.lng));
}

function markStaleIfNeeded(rating) {
  if (typeof rating.error === 'string' && rating.error.startsWith('places_api_')) {
    return { ...rating, matchStatus: 'stale' };
  }

  const updatedAt = rating.updatedAt ? Date.parse(rating.updatedAt) : 0;
  const ttl = rating.matchStatus === 'matched' ? MATCH_TTL_MS : RETRY_TTL_MS;
  if (!updatedAt || Date.now() - updatedAt > ttl) {
    return { ...rating, matchStatus: 'stale' };
  }
  return rating;
}

async function findGoogleRating(facility) {
  const apiKey = GOOGLE_MAPS_PLATFORM_KEY.value() || process.env.GOOGLE_MAPS_PLATFORM_KEY;
  if (!apiKey) {
    return buildStatus(facility, 'not_found', { error: 'GOOGLE_MAPS_PLATFORM_KEY secret is not configured' });
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.businessStatus',
        'places.currentOpeningHours',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.regularOpeningHours',
        'places.timeZone',
        'places.utcOffsetMinutes',
        'places.userRatingCount',
        'places.googleMapsUri',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: `${facility.name} ${facility.city} ${facility.address}`,
      languageCode: 'tr',
      regionCode: 'TR',
      maxResultCount: 5,
      locationBias: {
        circle: {
          center: {
            latitude: Number(facility.lat),
            longitude: Number(facility.lng),
          },
          radius: 750,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    logger.warn('Places API error', { facilityId: facility.id, status: response.status, message });
    return buildStatus(facility, 'not_found', { error: `places_api_${response.status}` });
  }

  const payload = await response.json();
  const candidates = (payload.places || [])
    .map((place) => scorePlace(facility, place))
    .sort((a, b) => b.matchScore - a.matchScore);

  const best = candidates[0];
  if (!best) {
    return buildStatus(facility, 'not_found');
  }

  const status = best.matchScore >= 68 ? 'matched' : 'ambiguous';
  return {
    facilityId: facility.id,
    placeId: best.place.id,
    displayName: best.place.displayName?.text,
    formattedAddress: best.place.formattedAddress,
    businessStatus: best.place.businessStatus,
    rating: best.place.rating,
    userRatingCount: best.place.userRatingCount,
    googleMapsUri: best.place.googleMapsUri,
    openingHours: buildOpeningHours(best.place),
    currentOpeningHours: sanitizeOpeningHours(best.place.currentOpeningHours, best.place),
    regularOpeningHours: sanitizeOpeningHours(best.place.regularOpeningHours, best.place),
    utcOffsetMinutes: best.place.utcOffsetMinutes,
    location: best.place.location ? {
      lat: best.place.location.latitude,
      lng: best.place.location.longitude,
    } : undefined,
    matchStatus: status,
    matchScore: Math.round(best.matchScore),
    distanceMeters: Math.round(best.distanceMeters),
    updatedAt: new Date().toISOString(),
  };
}

function hasExpectedCachedFields(rating) {
  if (rating.matchStatus === 'matched') {
    return Boolean(rating.openingHours || rating.currentOpeningHours || rating.regularOpeningHours);
  }
  return rating.matchStatus === 'not_found';
}

function buildOpeningHours(place) {
  const current = sanitizeOpeningHours(place.currentOpeningHours, place);
  const regular = sanitizeOpeningHours(place.regularOpeningHours, place);
  if (!current && !regular) return undefined;

  return removeUndefined({
    openNow: current?.openNow ?? regular?.openNow,
    nextCloseTime: current?.nextCloseTime,
    nextOpenTime: current?.nextOpenTime,
    weekdayDescriptions: current?.weekdayDescriptions?.length ? current.weekdayDescriptions : regular?.weekdayDescriptions,
    periods: regular?.periods?.length ? regular.periods : current?.periods,
    timeZone: getPlaceTimeZone(place),
    utcOffsetMinutes: place.utcOffsetMinutes,
  });
}

function sanitizeOpeningHours(hours, place) {
  if (!hours) return undefined;
  const sanitized = removeUndefined({
    openNow: typeof hours.openNow === 'boolean' ? hours.openNow : undefined,
    nextCloseTime: hours.nextCloseTime,
    nextOpenTime: hours.nextOpenTime,
    weekdayDescriptions: Array.isArray(hours.weekdayDescriptions)
      ? hours.weekdayDescriptions.filter((item) => typeof item === 'string')
      : undefined,
    periods: Array.isArray(hours.periods)
      ? hours.periods.map(sanitizeOpeningPeriod).filter(Boolean)
      : undefined,
    timeZone: getPlaceTimeZone(place),
    utcOffsetMinutes: place.utcOffsetMinutes,
  });
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeOpeningPeriod(period) {
  if (!period || !period.open) return undefined;
  return removeUndefined({
    open: sanitizeOpeningPoint(period.open),
    close: period.close ? sanitizeOpeningPoint(period.close) : undefined,
  });
}

function sanitizeOpeningPoint(point) {
  if (!point) return undefined;
  return removeUndefined({
    day: Number.isInteger(point.day) ? point.day : undefined,
    hour: Number.isInteger(point.hour) ? point.hour : undefined,
    minute: Number.isInteger(point.minute) ? point.minute : 0,
  });
}

function getPlaceTimeZone(place) {
  if (!place?.timeZone) return 'Europe/Istanbul';
  if (typeof place.timeZone === 'string') return place.timeZone;
  return place.timeZone.id || place.timeZone.name || 'Europe/Istanbul';
}

function removeUndefined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function scorePlace(facility, place) {
  const distanceMeters = place.location
    ? distanceBetweenMeters(
      { lat: Number(facility.lat), lng: Number(facility.lng) },
      { lat: place.location.latitude, lng: place.location.longitude },
    )
    : 999999;

  const nameScore = similarity(normalize(facility.name), normalize(place.displayName?.text || '')) * 60;
  const addressText = normalize(`${place.formattedAddress || ''}`);
  const cityScore = addressText.includes(normalize(facility.city)) ? 15 : 0;
  const districtScore = facility.cityDistrict && addressText.includes(normalize(facility.cityDistrict)) ? 10 : 0;
  const distanceScore = distanceMeters <= 100 ? 25 : distanceMeters <= 300 ? 18 : distanceMeters <= 750 ? 10 : 0;

  return {
    place,
    distanceMeters,
    matchScore: nameScore + cityScore + districtScore + distanceScore,
  };
}

function buildStatus(facility, matchStatus, extra = {}) {
  return {
    facilityId: facility.id,
    matchStatus,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

async function assertDailyQuota(nextCount) {
  const usageRef = db.collection(DAILY_USAGE_COLLECTION).doc(todayKey());
  const usage = await usageRef.get();
  const count = usage.exists ? Number(usage.data().count || 0) : 0;
  if (count + nextCount > DAILY_ENRICH_LIMIT) {
    const error = new Error('daily_enrich_limit_reached');
    error.statusCode = 429;
    throw error;
  }
}

async function incrementDailyUsage(count) {
  if (!count) return;
  await db.collection(DAILY_USAGE_COLLECTION).doc(todayKey()).set({
    count: FieldValue.increment(count),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;

  const aTokens = new Set(a.split(/\W+/).filter(Boolean));
  const bTokens = new Set(b.split(/\W+/).filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  return intersection / union;
}

function distanceBetweenMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value) {
  return value * Math.PI / 180;
}
