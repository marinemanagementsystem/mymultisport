const { setGlobalOptions } = require('firebase-functions/v2');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('crypto');

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10, memory: '512MiB' });

const GOOGLE_MAPS_PLATFORM_KEY = defineSecret('GOOGLE_MAPS_PLATFORM_KEY');
const RATINGS_ADMIN_USERNAME = defineSecret('RATINGS_ADMIN_USERNAME');
const RATINGS_ADMIN_PASSWORD = defineSecret('RATINGS_ADMIN_PASSWORD');
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const CACHE_COLLECTION = 'googleRatingMatches';
const DAILY_USAGE_COLLECTION = 'googlePlacesDailyUsage';
const MONTHLY_USAGE_COLLECTION = 'googlePlacesMonthlyUsage';
const SNAPSHOT_META_COLLECTION = 'googleRatingSnapshotMeta';
const SNAPSHOT_SHARDS_COLLECTION = 'googleRatingSnapshotShards';
const SNAPSHOT_META_DOC = 'current';
const BENEFIT_SOURCE_URL = 'https://benefitsystems.com.tr/facilities-tr.json';
const MAX_GET_BATCH = 100;
const MAX_ENRICH_BATCH = Number(process.env.MAX_ENRICH_BATCH || 50);
const DAILY_ENRICH_LIMIT = Number(process.env.DAILY_ENRICH_LIMIT || 50);
const MONTHLY_ENRICH_LIMIT = Number(process.env.MONTHLY_ENRICH_LIMIT || 900);
const SNAPSHOT_SHARD_COUNT = Number(process.env.RATING_SNAPSHOT_SHARD_COUNT || 40);

exports.api = onRequest({
  secrets: [GOOGLE_MAPS_PLATFORM_KEY, RATINGS_ADMIN_USERNAME, RATINGS_ADMIN_PASSWORD],
  cors: true,
}, async (req, res) => {
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

    if (req.method === 'GET' && path === '/ratings/snapshot') {
      await handleGetRatingsSnapshot(req, res);
      return;
    }

    if (req.method === 'POST' && path === '/ratings/enrich') {
      requireAdmin(req);
      await handleEnrichRatings(req, res);
      return;
    }

    if (req.method === 'GET' && path === '/admin/ratings/status') {
      requireAdmin(req);
      await handleAdminRatingsStatus(req, res);
      return;
    }

    if (req.method === 'POST' && path === '/admin/ratings/enrich') {
      requireAdmin(req);
      await handleEnrichRatings(req, res);
      return;
    }

    if (req.method === 'POST' && path === '/admin/ratings/snapshot/rebuild') {
      requireAdmin(req);
      await handleRebuildRatingsSnapshot(req, res);
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
  if (ids.length > MAX_GET_BATCH) {
    res.status(400).json({ error: 'too_many_ids', max: MAX_GET_BATCH });
    return;
  }

  const snapshots = await Promise.all(ids.map((id) => db.collection(CACHE_COLLECTION).doc(id).get()));
  const ratings = snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => markStaleIfNeeded(snapshot.data()));

  res.json({ ratings });
}

async function handleGetRatingsSnapshot(req, res) {
  const metaSnapshot = await db.collection(SNAPSHOT_META_COLLECTION).doc(SNAPSHOT_META_DOC).get();
  if (!metaSnapshot.exists) {
    res.status(404).json({ error: 'snapshot_not_found' });
    return;
  }

  const meta = metaSnapshot.data();
  const shardCount = Number(meta.shardCount || SNAPSHOT_SHARD_COUNT);
  const shardRefs = Array.from(
    { length: shardCount },
    (_, index) => db.collection(SNAPSHOT_SHARDS_COLLECTION).doc(shardId(index)),
  );
  const shardSnapshots = await Promise.all(shardRefs.map((ref) => ref.get()));
  const ratings = shardSnapshots.flatMap((snapshot) => {
    if (!snapshot.exists) return [];
    const data = snapshot.data();
    return Array.isArray(data.ratings) ? data.ratings : [];
  });

  res.json({ meta, ratings });
}

async function handleEnrichRatings(req, res) {
  const mode = getEnrichMode(req.body?.mode);
  const facilities = await resolveFacilitiesFromRequest(req.body || {});
  if (facilities.length === 0) {
    res.status(400).json({ error: 'no_facilities' });
    return;
  }
  if (facilities.length > MAX_ENRICH_BATCH) {
    res.status(400).json({ error: 'too_many_facilities', max: MAX_ENRICH_BATCH });
    return;
  }

  const ratings = [];
  const googleLookupQueue = [];
  const now = new Date().toISOString();

  for (const facility of facilities) {
    const docRef = db.collection(CACHE_COLLECTION).doc(facility.id);
    const snapshot = await docRef.get();
    const fingerprint = facilityFingerprint(facility);
    if (snapshot.exists) {
      const cached = withCacheMetadata(markStaleIfNeeded(snapshot.data()), facility, now);
      const reason = getLookupReason(cached, fingerprint, mode);
      if (!reason) {
        ratings.push(cached);
        await patchCacheMetadataIfNeeded(docRef, snapshot.data(), cached);
        continue;
      }
      googleLookupQueue.push({ facility, docRef, fingerprint, reason });
      continue;
    }

    googleLookupQueue.push({ facility, docRef, fingerprint, reason: 'missing_cache' });
  }

  await reserveQuota(googleLookupQueue.length);

  for (const item of googleLookupQueue) {
    const rating = withCacheMetadata(await findGoogleRating(item.facility), item.facility, new Date().toISOString());
    rating.refreshReason = item.reason;
    await item.docRef.set(rating);
    ratings.push(rating);
  }

  res.json({
    ratings,
    mode,
    googleLookupCount: googleLookupQueue.length,
    limits: {
      batch: MAX_ENRICH_BATCH,
      daily: DAILY_ENRICH_LIMIT,
      monthly: MONTHLY_ENRICH_LIMIT,
    },
  });
}

async function handleAdminRatingsStatus(req, res) {
  const [dailyUsage, monthlyUsage, snapshotMeta] = await Promise.all([
    db.collection(DAILY_USAGE_COLLECTION).doc(todayKey()).get(),
    db.collection(MONTHLY_USAGE_COLLECTION).doc(monthKey()).get(),
    db.collection(SNAPSHOT_META_COLLECTION).doc(SNAPSHOT_META_DOC).get(),
  ]);

  res.json({
    usage: {
      daily: usagePayload(dailyUsage, DAILY_ENRICH_LIMIT),
      monthly: usagePayload(monthlyUsage, MONTHLY_ENRICH_LIMIT),
    },
    limits: {
      batch: MAX_ENRICH_BATCH,
      daily: DAILY_ENRICH_LIMIT,
      monthly: MONTHLY_ENRICH_LIMIT,
      snapshotShards: SNAPSHOT_SHARD_COUNT,
    },
    snapshot: snapshotMeta.exists ? snapshotMeta.data() : null,
    time: new Date().toISOString(),
  });
}

async function handleRebuildRatingsSnapshot(req, res) {
  const facilities = Array.isArray(req.body?.facilities)
    ? req.body.facilities.filter(isFacilityPayload)
    : [];
  const facilitiesById = new Map(facilities.map((facility) => [facility.id, facility]));
  const cacheSnapshot = await db.collection(CACHE_COLLECTION).get();
  const rebuiltAt = new Date().toISOString();
  const metadataPatches = [];
  const ratings = cacheSnapshot.docs
    .map((doc) => {
      const facility = facilitiesById.get(doc.id);
      const original = { ...markStaleIfNeeded(doc.data()), facilityId: doc.id };
      const next = facility && !original.facilityFingerprint
        ? withCacheMetadata(original, facility, rebuiltAt)
        : original;
      if (facility && !original.facilityFingerprint) {
        metadataPatches.push({
          ref: doc.ref,
          data: {
            facilityFingerprint: next.facilityFingerprint,
            googleFetchedAt: next.googleFetchedAt,
            cacheUpdatedAt: next.cacheUpdatedAt,
          },
        });
      }
      return { ...next, snapshotUpdatedAt: rebuiltAt };
    })
    .filter((rating) => typeof rating.facilityId === 'string' && typeof rating.matchStatus === 'string');
  await commitCacheMetadataPatches(metadataPatches);
  const meta = await writeRatingsSnapshot(ratings, rebuiltAt);
  res.json({ meta });
}

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_GET_BATCH + 1);
}

async function resolveFacilitiesFromRequest(body) {
  if (Array.isArray(body.facilities)) {
    return body.facilities.filter(isFacilityPayload).slice(0, MAX_ENRICH_BATCH + 1);
  }

  const ids = Array.isArray(body.facilityIds) ? body.facilityIds : [];
  if (ids.length === 0) return [];

  const response = await fetch(BENEFIT_SOURCE_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Benefit Systems data fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const byId = new Map(data.map((facility) => [facility.id, facility]));
  return ids.map((id) => byId.get(id)).filter(isFacilityPayload).slice(0, MAX_ENRICH_BATCH + 1);
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

  return rating;
}

function getEnrichMode(value) {
  return ['delta', 'missing', 'selected'].includes(value) ? value : 'delta';
}

function getLookupReason(cached, fingerprint, mode) {
  if (!cached) return 'missing_cache';
  if (cached.facilityFingerprint && cached.facilityFingerprint !== fingerprint) return 'facility_changed';
  if (mode === 'selected') return 'admin_selected';
  if (mode === 'missing' && (cached.matchStatus !== 'matched' || !hasExpectedCachedFields(cached))) {
    return 'admin_missing_retry';
  }
  return '';
}

function withCacheMetadata(rating, facility, timestamp) {
  const fetchedAt = rating.googleFetchedAt || rating.updatedAt || timestamp;
  return removeUndefined({
    ...rating,
    facilityId: facility.id,
    facilityFingerprint: facilityFingerprint(facility),
    googleFetchedAt: fetchedAt,
    cacheUpdatedAt: rating.cacheUpdatedAt || timestamp,
  });
}

async function patchCacheMetadataIfNeeded(docRef, original, nextRating) {
  if (
    original.facilityFingerprint === nextRating.facilityFingerprint
    && original.googleFetchedAt === nextRating.googleFetchedAt
    && original.cacheUpdatedAt === nextRating.cacheUpdatedAt
  ) {
    return;
  }
  await docRef.set({
    facilityFingerprint: nextRating.facilityFingerprint,
    googleFetchedAt: nextRating.googleFetchedAt,
    cacheUpdatedAt: nextRating.cacheUpdatedAt,
  }, { merge: true });
}

async function commitCacheMetadataPatches(patches) {
  for (let i = 0; i < patches.length; i += 450) {
    const batch = db.batch();
    patches.slice(i, i + 450).forEach((patch) => {
      batch.set(patch.ref, removeUndefined(patch.data), { merge: true });
    });
    await batch.commit();
  }
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

function requireAdmin(req) {
  const expectedUsername = getSecretValue(RATINGS_ADMIN_USERNAME, 'RATINGS_ADMIN_USERNAME');
  const expectedPassword = getSecretValue(RATINGS_ADMIN_PASSWORD, 'RATINGS_ADMIN_PASSWORD');
  if (!expectedUsername || !expectedPassword) {
    const error = new Error('admin_credentials_not_configured');
    error.statusCode = 503;
    throw error;
  }

  const authorization = String(req.headers.authorization || '');
  const [scheme, token] = authorization.split(/\s+/);
  if (scheme?.toLowerCase() !== 'basic' || !token) {
    const error = new Error('unauthorized');
    error.statusCode = 401;
    throw error;
  }

  let decoded = '';
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    const error = new Error('unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const separatorIndex = decoded.indexOf(':');
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
  if (!timingSafeEqual(username, expectedUsername) || !timingSafeEqual(password, expectedPassword)) {
    const error = new Error('unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

function getSecretValue(secret, envName) {
  try {
    const value = secret.value();
    if (value) return value;
  } catch {
    // Local checks can use process.env without configured Firebase secrets.
  }
  return process.env[envName] || '';
}

function timingSafeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function reserveQuota(count) {
  if (!count) return;
  const dailyRef = db.collection(DAILY_USAGE_COLLECTION).doc(todayKey());
  const monthlyRef = db.collection(MONTHLY_USAGE_COLLECTION).doc(monthKey());
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const daily = await transaction.get(dailyRef);
    const monthly = await transaction.get(monthlyRef);
    const dailyCount = daily.exists ? Number(daily.data().count || 0) : 0;
    const monthlyCount = monthly.exists ? Number(monthly.data().count || 0) : 0;

    if (dailyCount + count > DAILY_ENRICH_LIMIT) {
      const error = new Error('daily_enrich_limit_reached');
      error.statusCode = 429;
      throw error;
    }
    if (monthlyCount + count > MONTHLY_ENRICH_LIMIT) {
      const error = new Error('monthly_enrich_limit_reached');
      error.statusCode = 429;
      throw error;
    }

    transaction.set(dailyRef, {
      count: dailyCount + count,
      limit: DAILY_ENRICH_LIMIT,
      updatedAt: now,
    }, { merge: true });
    transaction.set(monthlyRef, {
      count: monthlyCount + count,
      limit: MONTHLY_ENRICH_LIMIT,
      updatedAt: now,
    }, { merge: true });
  });
}

async function writeRatingsSnapshot(ratings, rebuiltAt) {
  const shardCount = SNAPSHOT_SHARD_COUNT;
  const shards = Array.from({ length: shardCount }, () => []);
  ratings.forEach((rating, index) => {
    shards[index % shardCount].push(removeUndefined(rating));
  });

  const meta = {
    rebuiltAt,
    shardCount,
    ratingCount: ratings.length,
    matchedCount: ratings.filter((rating) => rating.matchStatus === 'matched').length,
    hoursCount: ratings.filter((rating) => Boolean(
      rating.openingHours || rating.currentOpeningHours || rating.regularOpeningHours,
    )).length,
  };

  const batch = db.batch();
  batch.set(db.collection(SNAPSHOT_META_COLLECTION).doc(SNAPSHOT_META_DOC), meta, { merge: true });
  shards.forEach((ratingsForShard, index) => {
    batch.set(db.collection(SNAPSHOT_SHARDS_COLLECTION).doc(shardId(index)), {
      index,
      count: ratingsForShard.length,
      ratings: ratingsForShard,
      updatedAt: rebuiltAt,
    });
  });
  await batch.commit();
  return meta;
}

function usagePayload(snapshot, limit) {
  const data = snapshot.exists ? snapshot.data() : {};
  return {
    count: Number(data.count || 0),
    limit,
    updatedAt: data.updatedAt,
  };
}

function shardId(index) {
  return String(index).padStart(3, '0');
}

function facilityFingerprint(facility) {
  return JSON.stringify([
    normalizeForFingerprint(facility.id),
    normalizeForFingerprint(facility.name),
    normalizeForFingerprint(facility.address),
    normalizeForFingerprint(facility.city),
    normalizeForFingerprint(facility.cityDistrict),
    normalizeCoordinate(facility.lat),
    normalizeCoordinate(facility.lng),
  ]);
}

function normalizeForFingerprint(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : null;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function monthKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
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
