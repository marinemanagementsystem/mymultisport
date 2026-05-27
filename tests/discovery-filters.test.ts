import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFacilityResults,
  filterAndSortFacilities,
  getFacilityPosition,
  isUsableFacility,
} from '../src/lib/facilities.ts';

function result(overrides: Record<string, unknown>) {
  return {
    facility: {
      id: 'base',
      provider: 'pluxee',
      name: 'Base',
      slug: '',
      lat: 41,
      lng: 29,
      thumbnail: '',
      address: 'Adres',
      city: 'İstanbul',
      cityDistrict: 'Kadıköy',
      activityGroups: [{ name: 'Pluxee', activities: [{ name: 'BÜFE' }] }],
      discounts: [],
      amenities: ['Paket servis'],
      cards: ['Pluxee Yemek'],
      status: 1,
      desired: false,
      vcOnly: false,
      allowInternationalVisits: false,
      services: ['3'],
      serviceModes: ['paket'],
      pluxeePlus: false,
      isOpenNow: false,
      ...overrides,
    },
    distanceKm: overrides.distanceKm,
  };
}

test('filters Pluxee places by service, Pluxee Plus, open now, and service mode', () => {
  const filtered = filterAndSortFacilities([
    result({ id: 'pluxee:1', name: 'Yemek Plus Açık', services: ['3'], pluxeePlus: true, isOpenNow: true, serviceModes: ['paket'] }),
    result({ id: 'pluxee:2', name: 'Business Plus Açık', services: ['4'], pluxeePlus: true, isOpenNow: true, serviceModes: ['paket'] }),
    result({ id: 'pluxee:3', name: 'Yemek Normal Açık', services: ['3'], pluxeePlus: false, isOpenNow: true, serviceModes: ['paket'] }),
    result({ id: 'pluxee:4', name: 'Yemek Plus Kapalı', services: ['3'], pluxeePlus: true, isOpenNow: false, serviceModes: ['paket'] }),
    result({ id: 'pluxee:5', name: 'Yemek Plus Masa', services: ['3'], pluxeePlus: true, isOpenNow: true, serviceModes: ['masa'] }),
  ] as any, {
    query: '',
    city: '',
    district: '',
    activity: '',
    sort: 'recommended',
    minRating: 0,
    minReviews: 0,
    radiusKm: 0,
    hoursMode: '',
    hoursTime: '23:00',
    hoursEndTime: '23:00',
    card: '',
    amenity: '',
    personal: '',
    hasPhoto: false,
    activeOnly: false,
    internationalOnly: false,
    providerService: '3',
    pluxeePlusOnly: true,
    openNowOnly: true,
    serviceMode: 'paket',
  } as any);

  assert.deepEqual(filtered.map((item) => item.facility.id), ['pluxee:1']);
});

test('keeps Pluxee records without native coordinates and uses live Google location when present', () => {
  const withoutNativeCoordinates = {
    ...result({
      id: 'pluxee:google-only',
      lat: undefined,
      lng: undefined,
      googleLocation: {
        placeId: 'places/google-only',
        lat: 41.01,
        lng: 29.02,
        fetchedAt: '2026-05-28T00:00:00.000Z',
        expiresAt: '2026-06-27T00:00:00.000Z',
        source: 'google_places_details',
      },
    }).facility,
  };
  const waitingForLocation = {
    ...result({
      id: 'pluxee:waiting',
      lat: undefined,
      lng: undefined,
      locationStatus: 'google_pending',
    }).facility,
  };

  assert.equal(isUsableFacility(waitingForLocation as any), true);
  assert.deepEqual(getFacilityPosition(withoutNativeCoordinates as any), {
    lat: 41.01,
    lng: 29.02,
    source: 'google',
  });
  const [googleOnly] = buildFacilityResults([withoutNativeCoordinates] as any, {}, { lat: 41, lng: 29 });
  assert.equal(Math.round((googleOnly.distanceKm || 0) * 10) / 10, 2);
});

test('uses Batı Marmara district center fallback for unmapped Pluxee records', () => {
  const unmappedRegionalPlace = {
    ...result({
      id: 'pluxee:tekirdag',
      lat: undefined,
      lng: undefined,
      city: 'Tekirdağ',
      cityDistrict: 'Çorlu',
      locationStatus: 'google_pending',
    }).facility,
  };

  const position = getFacilityPosition(unmappedRegionalPlace as any);
  assert.equal(position?.source, 'approximate');
  assert.equal(Math.round((position?.lat || 0) * 1000) / 1000, 41.159);
  assert.equal(Math.round((position?.lng || 0) * 1000) / 1000, 27.801);
});
