import type { BenefitFacility } from '../types';

type ApproximateLocation = {
  lat: number;
  lng: number;
};

const WEST_MARMARA_DISTRICT_CENTERS: Record<string, ApproximateLocation> = {
  'canakkale/ayvacik': { lat: 39.601, lng: 26.404 },
  'canakkale/bayramic': { lat: 39.809, lng: 26.609 },
  'canakkale/biga': { lat: 40.228, lng: 27.242 },
  'canakkale/bozcaada': { lat: 39.835, lng: 26.069 },
  'canakkale/can': { lat: 40.027, lng: 27.052 },
  'canakkale/eceabat': { lat: 40.184, lng: 26.358 },
  'canakkale/ezine': { lat: 39.785, lng: 26.340 },
  'canakkale/gelibolu': { lat: 40.410, lng: 26.670 },
  'canakkale/gokceada': { lat: 40.201, lng: 25.910 },
  'canakkale/lapseki': { lat: 40.345, lng: 26.686 },
  'canakkale/merkez': { lat: 40.155, lng: 26.414 },
  'canakkale/yenice': { lat: 39.930, lng: 27.258 },
  'canakkale/kepez': { lat: 40.102, lng: 26.407 },
  'edirne/enez': { lat: 40.724, lng: 26.083 },
  'edirne/havsa': { lat: 41.548, lng: 26.822 },
  'edirne/ipsala': { lat: 40.921, lng: 26.382 },
  'edirne/kesan': { lat: 40.855, lng: 26.630 },
  'edirne/lalapasa': { lat: 41.839, lng: 26.735 },
  'edirne/meric': { lat: 41.191, lng: 26.420 },
  'edirne/merkez': { lat: 41.677, lng: 26.555 },
  'edirne/suloglu': { lat: 41.769, lng: 26.910 },
  'edirne/uzunkopru': { lat: 41.265, lng: 26.688 },
  'tekirdag/cerkezkoy': { lat: 41.286, lng: 27.999 },
  'tekirdag/corlu': { lat: 41.159, lng: 27.801 },
  'tekirdag/ergene': { lat: 41.213, lng: 27.760 },
  'tekirdag/hayrabolu': { lat: 41.213, lng: 27.106 },
  'tekirdag/kapakli': { lat: 41.329, lng: 27.980 },
  'tekirdag/malkara': { lat: 40.890, lng: 26.902 },
  'tekirdag/marmaraereglisi': { lat: 40.970, lng: 27.955 },
  'tekirdag/merkez': { lat: 40.979, lng: 27.515 },
  'tekirdag/muratli': { lat: 41.172, lng: 27.500 },
  'tekirdag/saray': { lat: 41.444, lng: 27.921 },
  'tekirdag/suleymanpasa': { lat: 40.979, lng: 27.515 },
  'tekirdag/sarkoy': { lat: 40.613, lng: 27.114 },
};

const WEST_MARMARA_CITY_CENTERS: Record<string, ApproximateLocation> = {
  canakkale: { lat: 40.155, lng: 26.414 },
  edirne: { lat: 41.677, lng: 26.555 },
  tekirdag: { lat: 40.979, lng: 27.515 },
};

export function getPluxeeApproximateLocation(facility: BenefitFacility): ApproximateLocation | undefined {
  if (facility.provider !== 'pluxee') return undefined;
  const city = locationKey(facility.city);
  if (!city) return undefined;
  const district = locationKey(facility.cityDistrict);
  return WEST_MARMARA_DISTRICT_CENTERS[`${city}/${district}`] || WEST_MARMARA_CITY_CENTERS[city];
}

function locationKey(value = ''): string {
  return value
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, '');
}
