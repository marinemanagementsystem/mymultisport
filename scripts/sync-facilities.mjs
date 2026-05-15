import { mkdir, readFile, writeFile } from 'node:fs/promises';

const SOURCE_URL = 'https://benefitsystems.com.tr/facilities-tr.json';
const OUTPUT_PATH = new URL('../public/data/facilities-tr.json', import.meta.url);
const CHANGE_PATH = new URL('../public/data/facility-changes.json', import.meta.url);

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

const previous = await readPreviousFacilities();
const existingSummary = await readExistingChangeSummary();
const freshChanges = buildChangeSummary(previous, normalized);
const changes = chooseChangeSummary(freshChanges, existingSummary);

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(normalized)}\n`);
await writeFile(CHANGE_PATH, `${JSON.stringify(changes, null, 2)}\n`);

console.log(`Synced ${normalized.length} facilities to ${OUTPUT_PATH.pathname}`);
console.log(`Wrote facility change summary to ${CHANGE_PATH.pathname}`);

async function readPreviousFacilities() {
  try {
    const raw = await readFile(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidFacility) : [];
  } catch {
    return [];
  }
}

async function readExistingChangeSummary() {
  try {
    const raw = await readFile(CHANGE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function chooseChangeSummary(freshChanges, existingSummary) {
  if (changeCount(freshChanges) > 0) return freshChanges;
  if (existingSummary && changeCount(existingSummary) > 0 && existingSummary.currentCount === freshChanges.currentCount) {
    return existingSummary;
  }
  return freshChanges;
}

function changeCount(summary) {
  return (summary.newFacilities?.length || 0)
    + (summary.removedFacilities?.length || 0)
    + (summary.updatedFacilities?.length || 0);
}

function buildChangeSummary(previousFacilities, currentFacilities) {
  const previousById = new Map(previousFacilities.map((facility) => [facility.id, facility]));
  const currentById = new Map(currentFacilities.map((facility) => [facility.id, facility]));

  const newFacilities = currentFacilities
    .filter((facility) => !previousById.has(facility.id))
    .map(toChangeItem)
    .slice(0, 80);

  const removedFacilities = previousFacilities
    .filter((facility) => !currentById.has(facility.id))
    .map(toChangeItem)
    .slice(0, 80);

  const updatedFacilities = currentFacilities
    .map((facility) => {
      const previous = previousById.get(facility.id);
      if (!previous) return null;
      const changedFields = changedFacilityFields(previous, facility);
      return changedFields.length > 0 ? { ...toChangeItem(facility), changedFields } : null;
    })
    .filter(Boolean)
    .slice(0, 80);

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
    previousCount: previousFacilities.length,
    currentCount: currentFacilities.length,
    newFacilities,
    removedFacilities,
    updatedFacilities,
  };
}

function changedFacilityFields(previous, current) {
  const checks = [
    ['name', previous.name, current.name],
    ['address', previous.address, current.address],
    ['district', previous.cityDistrict, current.cityDistrict],
    ['cards', sortedKey(previous.cards), sortedKey(current.cards)],
    ['activities', sortedKey(activityNames(previous)), sortedKey(activityNames(current))],
    ['amenities', sortedKey(previous.amenities), sortedKey(current.amenities)],
    ['discounts', sortedKey(previous.discounts), sortedKey(current.discounts)],
    ['status', previous.status, current.status],
    ['international', previous.allowInternationalVisits, current.allowInternationalVisits],
  ];
  return checks
    .filter(([, before, after]) => before !== after)
    .map(([field]) => field);
}

function toChangeItem(facility) {
  return {
    id: facility.id,
    name: facility.name,
    city: facility.city,
    cityDistrict: facility.cityDistrict,
    cards: facility.cards || [],
    activities: activityNames(facility).slice(0, 5),
  };
}

function activityNames(facility) {
  const names = new Set();
  for (const group of facility.activityGroups || []) {
    for (const activity of group.activities || []) {
      if (activity?.name) names.add(activity.name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr'));
}

function sortedKey(values = []) {
  return [...values].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'tr')).join('|');
}
