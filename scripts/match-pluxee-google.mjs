import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildIdOnlyPluxeeMatch,
  buildPluxeeGoogleQuery,
  isReusablePluxeeMatch,
  searchPluxeePlaceIds,
} from './lib/pluxee-google-match.mjs';

const DEFAULT_INDEX_PATH = new URL('../public/data/providers/pluxee/index-tr.json', import.meta.url).pathname;
const DEFAULT_MATCH_PATH = new URL('../public/data/providers/pluxee/google-place-matches.json', import.meta.url).pathname;

const options = parseArgs(process.argv.slice(2));
const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;

if (!apiKey && !options.planOnly) {
  throw new Error('GOOGLE_MAPS_PLATFORM_KEY is required for Pluxee Google matching.');
}

const places = JSON.parse(await readFile(options.indexPath, 'utf8'));
const existingMatches = await readExistingMatches(options.matchPath);
const existingMatchByFacility = new Map(existingMatches.map((match) => [match.facilityId, match]));

for (const place of places) {
  const existing = existingMatchByFacility.get(place.id);
  if (!place.googleMatch && isReusablePluxeeMatch(place, existing)) {
    place.googleMatch = existing;
    place.locationStatus = hasNativeLocation(place) ? 'pluxee' : 'google_pending';
  }
}

const candidates = places
  .filter((place) => options.force || !place.googleMatch?.googlePlaceId)
  .slice(0, options.limit ?? places.length);
const matchedByFacility = new Map(
  places
    .map((place) => place.googleMatch)
    .filter(Boolean)
    .map((match) => [match.facilityId, match]),
);

for (const place of candidates) {
  const match = options.planOnly
    ? buildIdOnlyPluxeeMatch(place, buildPluxeeGoogleQuery(place), { candidatePlaceIds: [] })
    : await matchPlace(place);
  matchedByFacility.set(place.id, match);

  const index = places.findIndex((item) => item.id === place.id);
  if (index >= 0) {
    places[index] = {
      ...places[index],
      googleMatch: match,
      locationStatus: hasNativeLocation(places[index]) ? 'pluxee' : match.googlePlaceId ? 'google_pending' : 'missing',
    };
  }

  console.log(`${match.matchStatus} ${place.name} ${match.googlePlaceId || '-'}`);
  if (options.delayMs > 0) await sleep(options.delayMs);
}

if (options.dryRun) {
  console.log(`dry-run: matched ${candidates.length} records, no files written`);
  process.exit(0);
}

const mergedMatches = places
  .map((place) => matchedByFacility.get(place.id))
  .filter(Boolean);

await writeFile(options.matchPath, `${JSON.stringify(mergedMatches, null, 2)}\n`);
await writeFile(options.indexPath, `${JSON.stringify(places)}\n`);
console.log(`wrote ${mergedMatches.length} Google place matches to ${options.matchPath}`);

async function matchPlace(place) {
  const { queryUsed, search, error } = await searchPluxeePlaceIds({ apiKey, place });
  if (error) {
    return {
      ...buildIdOnlyPluxeeMatch(place, queryUsed, { candidatePlaceIds: [] }),
      matchStatus: 'error',
      error,
    };
  }
  return buildIdOnlyPluxeeMatch(place, queryUsed, search);
}

function parseArgs(args) {
  const parsed = {
    indexPath: DEFAULT_INDEX_PATH,
    matchPath: DEFAULT_MATCH_PATH,
    limit: undefined,
    delayMs: 120,
    dryRun: false,
    force: false,
    planOnly: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--ids-only') continue;
    else if (arg === '--plan-only') parsed.planOnly = true;
    else if (arg.startsWith('--index=')) parsed.indexPath = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--matches=')) parsed.matchPath = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.split('=')[1]);
    else if (arg.startsWith('--delay-ms=')) parsed.delayMs = Number(arg.split('=')[1]);
  }

  if (Number.isNaN(parsed.limit)) parsed.limit = undefined;
  if (!Number.isFinite(parsed.delayMs)) parsed.delayMs = 120;
  return parsed;
}

async function readExistingMatches(filePath) {
  try {
    const payload = JSON.parse(await readFile(filePath, 'utf8'));
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

function hasNativeLocation(place) {
  return Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
