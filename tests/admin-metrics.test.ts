import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMultiSportAdminStats,
  buildPluxeeAdminStats,
} from '../src/lib/adminMetrics.ts';

test('builds provider-specific Pluxee admin location stats', () => {
  const stats = buildPluxeeAdminStats([
    { id: 'native', name: 'Native', provider: 'pluxee', lat: 41, lng: 29 },
    { id: 'resolved', name: 'Resolved', provider: 'pluxee', googleLocation: { placeId: 'places/1', lat: 41.1, lng: 29.1, fetchedAt: '', expiresAt: '', source: 'google_places_details' }, googleMatch: { facilityId: 'resolved', googlePlaceId: 'places/1', matchStatus: 'matched', matchedAt: '', pluxeeFingerprint: '', queryUsed: '' } },
    { id: 'pending', name: 'Pending', provider: 'pluxee', googleMatch: { facilityId: 'pending', googlePlaceId: 'places/2', matchStatus: 'matched', matchedAt: '', pluxeeFingerprint: '', queryUsed: '' } },
    { id: 'approximate', name: 'Approximate', provider: 'pluxee', city: 'Tekirdağ', cityDistrict: 'Çorlu' },
    { id: 'missing', name: 'Missing', provider: 'pluxee' },
  ] as any);

  assert.deepEqual(stats, {
    total: 5,
    nativeLocationCount: 1,
    googlePlaceIdCount: 2,
    googleResolvedCount: 1,
    approximateLocationCount: 1,
    googlePendingCount: 1,
    missingLocationCount: 1,
  });
});

test('builds MultiSport admin cache stats without counting Pluxee metrics', () => {
  const stats = buildMultiSportAdminStats([
    { id: 'facility:1', name: 'Facility 1', address: 'A', city: 'İstanbul', cityDistrict: 'Kadıköy', lat: 41, lng: 29 },
  ] as any, {
    'facility:1': {
      facilityId: 'facility:1',
      matchStatus: 'matched',
      rating: 4.8,
      openingHours: { openNow: true },
    },
  } as any);

  assert.equal(stats.cached, 1);
  assert.equal(stats.matched, 1);
  assert.equal(stats.withHours, 1);
  assert.equal(stats.deltaFacilities.length, 0);
  assert.equal(stats.missingFacilities.length, 0);
});
