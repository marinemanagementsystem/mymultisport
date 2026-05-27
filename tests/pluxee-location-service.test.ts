import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPluxeeLocationCachePayload,
  resolvePluxeeLocations,
} from '../functions/pluxee-location-service.js';

const now = new Date('2026-05-28T00:00:00.000Z');

test('Pluxee location resolver uses fresh cache without consuming Google quota', async () => {
  let quotaReservations = 0;
  let fetchCalls = 0;
  const result = await resolvePluxeeLocations({
    placeIds: ['places/fresh'],
    now,
    getCachedLocation: async () => createPluxeeLocationCachePayload('places/fresh', { latitude: 41.1, longitude: 29.1 }, now),
    reserveQuota: async (count: number) => { quotaReservations += count; },
    fetchLocation: async () => {
      fetchCalls += 1;
      return { latitude: 0, longitude: 0 };
    },
    writeCachedLocation: async () => {},
  });

  assert.equal(quotaReservations, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].lat, 41.1);
  assert.equal(result.pendingQuota, false);
});

test('Pluxee location resolver refreshes expired cache and writes a 30 day cache payload', async () => {
  const writes: unknown[] = [];
  const result = await resolvePluxeeLocations({
    placeIds: ['places/expired'],
    now,
    getCachedLocation: async () => ({
      placeId: 'places/expired',
      lat: 40,
      lng: 28,
      fetchedAt: '2026-04-01T00:00:00.000Z',
      expiresAt: '2026-05-01T00:00:00.000Z',
      source: 'google_places_details',
    }),
    reserveQuota: async () => {},
    fetchLocation: async () => ({ latitude: 41.2, longitude: 29.2 }),
    writeCachedLocation: async (_placeId: string, payload: unknown) => { writes.push(payload); },
  });

  assert.equal(result.locations[0].lat, 41.2);
  assert.equal(writes.length, 1);
  assert.equal((writes[0] as any).expiresAt, '2026-06-27T00:00:00.000Z');
});

test('Pluxee location resolver reports pending_quota when monthly limit is exhausted', async () => {
  const result = await resolvePluxeeLocations({
    placeIds: ['places/quota'],
    now,
    getCachedLocation: async () => null,
    reserveQuota: async () => {
      const error: any = new Error('monthly_pluxee_location_limit_reached');
      error.code = 'pending_quota';
      throw error;
    },
    fetchLocation: async () => {
      throw new Error('must_not_fetch_after_quota_failure');
    },
    writeCachedLocation: async () => {},
  });

  assert.equal(result.pendingQuota, true);
  assert.deepEqual(result.missingPlaceIds, ['places/quota']);
  assert.deepEqual(result.locations, []);
});
