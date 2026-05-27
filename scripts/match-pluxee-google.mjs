import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintPluxeePlace } from './lib/pluxee-import.mjs';

const DEFAULT_INDEX_PATH = new URL('../public/data/providers/pluxee/index-tr.json', import.meta.url).pathname;
const DEFAULT_MATCH_PATH = new URL('../public/data/providers/pluxee/google-place-matches.json', import.meta.url).pathname;

const options = parseArgs(process.argv.slice(2));
const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;

if (!apiKey) {
  throw new Error('GOOGLE_MAPS_PLATFORM_KEY is required for Pluxee Google matching.');
}

const places = JSON.parse(await readFile(options.indexPath, 'utf8'));
const candidates = places
  .filter((place) => options.force || !place.googleMatch?.googlePlaceId)
  .slice(0, options.limit ?? places.length);
const matches = [];

for (const place of candidates) {
  const match = await matchPlace(place);
  matches.push(match);
  const index = places.findIndex((item) => item.id === place.id);
  if (index >= 0) {
    places[index] = {
      ...places[index],
      googleMatch: match,
    };
  }
  console.log(`${match.matchStatus} ${place.name} ${match.googlePlaceId || '-'}`);
  if (options.delayMs > 0) await sleep(options.delayMs);
}

if (options.dryRun) {
  console.log(`dry-run: matched ${matches.length} records, no files written`);
  process.exit(0);
}

await writeFile(options.matchPath, `${JSON.stringify(matches, null, 2)}\n`);
await writeFile(options.indexPath, `${JSON.stringify(places)}\n`);
console.log(`wrote ${matches.length} Google place matches to ${options.matchPath}`);

async function matchPlace(place) {
  const queryUsed = [place.name, place.address, place.cityDistrict, place.city, 'Türkiye']
    .filter(Boolean)
    .join(', ');
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: queryUsed,
      languageCode: 'tr',
      regionCode: 'TR',
      locationBias: {
        circle: {
          center: { latitude: place.lat, longitude: place.lng },
          radius: 300,
        },
      },
      maxResultCount: 3,
    }),
  });

  if (!response.ok) {
    return baseMatch(place, queryUsed, {
      matchStatus: 'error',
      error: `places_api_${response.status}`,
    });
  }

  const payload = await response.json();
  const candidate = chooseBestCandidate(place, payload.places || []);
  if (!candidate) {
    return baseMatch(place, queryUsed, { matchStatus: 'not_found' });
  }

  return baseMatch(place, queryUsed, {
    googlePlaceId: candidate.id,
    matchStatus: candidate.score >= 74 ? 'matched' : 'ambiguous',
    matchScore: candidate.score,
    distanceMeters: candidate.distanceMeters,
  });
}

function chooseBestCandidate(place, candidates) {
  return candidates
    .map((candidate) => {
      const location = candidate.location || {};
      const distanceMeters = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
        ? Math.round(distanceKm({ lat: place.lat, lng: place.lng }, { lat: location.latitude, lng: location.longitude }) * 1000)
        : undefined;
      const nameScore = similarityScore(place.name, candidate.displayName?.text || '');
      const distanceScore = distanceMeters === undefined ? 0 : Math.max(0, 30 - Math.min(distanceMeters, 300) / 10);
      return {
        id: candidate.id,
        distanceMeters,
        score: Math.round(nameScore * 0.7 + distanceScore),
      };
    })
    .sort((a, b) => b.score - a.score)[0];
}

function baseMatch(place, queryUsed, overrides) {
  return {
    facilityId: place.id,
    matchedAt: new Date().toISOString(),
    pluxeeFingerprint: place.fingerprint || fingerprintPluxeePlace(place),
    queryUsed,
    ...overrides,
  };
}

function similarityScore(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 82;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const overlap = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return Math.round((overlap / Math.max(leftTokens.size, rightTokens.size, 1)) * 80);
}

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

function distanceKm(from, to) {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(to.lat - from.lat);
  const dLng = degreesToRadians(to.lng - from.lng);
  const lat1 = degreesToRadians(from.lat);
  const lat2 = degreesToRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value) {
  return value * Math.PI / 180;
}

function parseArgs(args) {
  const parsed = {
    indexPath: DEFAULT_INDEX_PATH,
    matchPath: DEFAULT_MATCH_PATH,
    limit: undefined,
    delayMs: 120,
    dryRun: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg.startsWith('--index=')) parsed.indexPath = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--matches=')) parsed.matchPath = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.split('=')[1]);
    else if (arg.startsWith('--delay-ms=')) parsed.delayMs = Number(arg.split('=')[1]);
  }

  if (Number.isNaN(parsed.limit)) parsed.limit = undefined;
  if (!Number.isFinite(parsed.delayMs)) parsed.delayMs = 120;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
