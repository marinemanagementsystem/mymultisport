import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildIdOnlyPluxeeMatch,
  isReusablePluxeeMatch,
  sanitizeIdOnlyPlaceSearch,
} from '../scripts/lib/pluxee-google-match.mjs';

const place = {
  id: 'pluxee:test',
  name: 'BARIŞ BÜFE',
  address: '',
  city: 'İstanbul',
  cityDistrict: 'Kadıköy',
  neighborhood: 'Şaşkınbakkal',
  fingerprint: 'fingerprint-1',
};

test('ID-only Pluxee Google match stores only place ids and match metadata', () => {
  const search = sanitizeIdOnlyPlaceSearch({
    places: [
      { id: 'places/google-1', displayName: { text: 'Should not persist' }, location: { latitude: 41, longitude: 29 } },
      { id: 'places/google-2', formattedAddress: 'Should not persist' },
    ],
  });
  const match = buildIdOnlyPluxeeMatch(place as any, 'BARIŞ BÜFE Kadıköy İstanbul Türkiye', search, '2026-05-28T00:00:00.000Z');

  assert.deepEqual(match, {
    facilityId: 'pluxee:test',
    googlePlaceId: 'places/google-1',
    candidatePlaceIds: ['places/google-1', 'places/google-2'],
    matchStatus: 'matched',
    matchedAt: '2026-05-28T00:00:00.000Z',
    pluxeeFingerprint: 'fingerprint-1',
    queryUsed: 'BARIŞ BÜFE Kadıköy İstanbul Türkiye',
  });
  assert.equal('location' in match, false);
  assert.equal('formattedAddress' in match, false);
  assert.equal('displayName' in match, false);
});

test('ID-only Pluxee Google match returns not_found without place ids', () => {
  const match = buildIdOnlyPluxeeMatch(place as any, 'missing', { candidatePlaceIds: [] }, '2026-05-28T00:00:00.000Z');

  assert.equal(match.matchStatus, 'not_found');
  assert.equal(match.googlePlaceId, undefined);
  assert.deepEqual(match.candidatePlaceIds, []);
});

test('reuses an existing Pluxee Google match only when fingerprint is current', () => {
  assert.equal(isReusablePluxeeMatch(place as any, {
    facilityId: 'pluxee:test',
    googlePlaceId: 'places/google-1',
    matchStatus: 'matched',
    matchedAt: '2026-05-28T00:00:00.000Z',
    pluxeeFingerprint: 'fingerprint-1',
    queryUsed: 'BARIŞ BÜFE Kadıköy İstanbul Türkiye',
  }), true);

  assert.equal(isReusablePluxeeMatch(place as any, {
    facilityId: 'pluxee:test',
    googlePlaceId: 'places/google-1',
    matchStatus: 'matched',
    matchedAt: '2026-05-28T00:00:00.000Z',
    pluxeeFingerprint: 'stale-fingerprint',
    queryUsed: 'BARIŞ BÜFE Kadıköy İstanbul Türkiye',
  }), false);
});
