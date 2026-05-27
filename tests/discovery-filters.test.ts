import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAndSortFacilities } from '../src/lib/facilities.ts';

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
