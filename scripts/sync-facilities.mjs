import { mkdir, writeFile } from 'node:fs/promises';

const SOURCE_URL = 'https://benefitsystems.com.tr/facilities-tr.json';
const OUTPUT_PATH = new URL('../public/data/facilities-tr.json', import.meta.url);

function isValidFacility(facility) {
  return facility
    && typeof facility.id === 'string'
    && typeof facility.name === 'string'
    && Number.isFinite(facility.lat)
    && Number.isFinite(facility.lng);
}

const response = await fetch(SOURCE_URL, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'MyMultiSport internal data sync',
  },
});

if (!response.ok) {
  throw new Error(`Benefit Systems tesis datası indirilemedi: ${response.status} ${response.statusText}`);
}

const rawFacilities = await response.json();
if (!Array.isArray(rawFacilities)) {
  throw new Error('Beklenen tesis datası array değil.');
}

const normalized = rawFacilities
  .filter(isValidFacility)
  .map((facility) => ({
    id: facility.id,
    name: facility.name,
    slug: facility.slug || '',
    lat: facility.lat,
    lng: facility.lng,
    thumbnail: facility.thumbnail || '',
    address: facility.address || '',
    city: facility.city || '',
    cityDistrict: facility.cityDistrict || '',
    activityGroups: Array.isArray(facility.activityGroups) ? facility.activityGroups : [],
    discounts: Array.isArray(facility.discounts) ? facility.discounts : [],
    amenities: Array.isArray(facility.amenities) ? facility.amenities : [],
    cards: Array.isArray(facility.cards) ? facility.cards : [],
    status: facility.status ?? 0,
    desired: Boolean(facility.desired),
    vcOnly: Boolean(facility.vcOnly),
    allowInternationalVisits: Boolean(facility.allowInternationalVisits),
  }));

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(normalized)}\n`);

console.log(`Synced ${normalized.length} facilities to ${OUTPUT_PATH.pathname}`);
