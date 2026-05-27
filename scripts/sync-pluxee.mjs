import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildPluxeeSnapshot,
  normalizePluxeeMerchant,
  parsePluxeeDetailHtml,
  PLUXEE_BASE_URL,
  PLUXEE_SERVICES,
  resolvePluxeeLocationTargets,
} from './lib/pluxee-import.mjs';

const DEFAULT_OUT_DIR = new URL('../public/data/providers/pluxee', import.meta.url).pathname;
const DEFAULT_CACHE_DIR = new URL('../.cache/pluxee', import.meta.url).pathname;

const options = parseArgs(process.argv.slice(2));
const runId = options.runId || new Date().toISOString().replace(/[:.]/g, '-');
const generatedAt = new Date().toISOString();
const services = options.services.length > 0 ? options.services : Object.keys(PLUXEE_SERVICES);
const locationTargets = resolvePluxeeLocationTargets(options.locations);
const importLocations = [
  ...(options.includeDefaultLocation || locationTargets.length === 0 ? [null] : []),
  ...locationTargets,
];

const allMerchants = [];
const sourceCounts = {};

for (const serviceId of services) {
  for (const locationTarget of importLocations) {
    const rows = await fetchServiceRows(serviceId, locationTarget);
    sourceCounts[sourceCountKey(serviceId, locationTarget)] = rows.length;
    const rowsToDetail = options.details === undefined ? rows : rows.slice(0, options.details);
    let detailCount = 0;

    for (const row of rowsToDetail) {
      const detail = await fetchMerchantDetail(row.url).catch((error) => {
        console.warn(`detail_failed service=${serviceId} location=${locationTarget?.code || 'default'} page=${row.__sourcePage} url=${row.url || '-'} reason=${error.message}`);
        return {};
      });
      allMerchants.push(normalizePluxeeMerchant({
        serviceId,
        sourcePage: row.__sourcePage,
        sourceLocation: locationTarget,
        row,
        detail,
      }));
      detailCount += 1;
      if (options.delayMs > 0) await sleep(options.delayMs);
    }

    if (options.details !== undefined && rows.length > rowsToDetail.length) {
      for (const row of rows.slice(rowsToDetail.length)) {
        allMerchants.push(normalizePluxeeMerchant({
          serviceId,
          sourcePage: row.__sourcePage,
          sourceLocation: locationTarget,
          row,
          detail: {},
        }));
      }
    }

    console.log(`service=${serviceId} location=${locationTarget?.label || 'default'} list_rows=${rows.length} detail_pages=${detailCount}`);
  }
}

const snapshot = buildPluxeeSnapshot(allMerchants, {
  runId,
  generatedAt,
  sourceServices: services,
  sourceLocations: importLocations.filter(Boolean),
  sourceCounts,
});

console.log(`records=${snapshot.index.length} mapped=${snapshot.manifest.totalMapped} unmapped=${snapshot.unmapped.length} cities=${snapshot.manifest.cities.length}`);

if (options.dryRun) {
  console.log('dry-run: no files written');
  process.exit(0);
}

await writeSnapshot(snapshot, options.outDir);
await writeFile(
  path.join(options.outDir, 'import-report.json'),
  `${JSON.stringify({
    runId,
    generatedAt,
    services,
    locations: importLocations.filter(Boolean),
    includeDefaultLocation: options.includeDefaultLocation || locationTargets.length === 0,
    sourceCounts,
    records: snapshot.index.length,
    mapped: snapshot.manifest.totalMapped,
    unmapped: snapshot.unmapped.length,
    cityCount: snapshot.manifest.cities.length,
  }, null, 2)}\n`,
);

console.log(`wrote Pluxee snapshot to ${options.outDir}`);

async function fetchServiceRows(serviceId, locationTarget) {
  const first = await fetchSearchPage(serviceId, locationTarget, 1);
  const pageCount = Math.max(1, Number(first.pages || 1));
  const maxPages = options.pages === undefined ? pageCount : Math.min(pageCount, options.pages);
  const rows = annotateRows(first.data || [], 1, locationTarget);

  for (let page = 2; page <= maxPages; page += 1) {
    const payload = await fetchSearchPage(serviceId, locationTarget, page);
    const pageRows = payload.data || [];
    if (pageRows.length === 0) break;
    rows.push(...annotateRows(pageRows, page, locationTarget));
    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  return rows;
}

async function fetchSearchPage(serviceId, locationTarget, page) {
  const locationCacheKey = locationTarget?.code || 'default';
  const cachePath = path.join(options.cacheDir, 'raw', `service-${serviceId}`, `location-${locationCacheKey}`, `page-${page}.json`);
  const cached = await readJson(cachePath);
  if (cached) return cached;

  const searchParams = new URLSearchParams({
    urun: String(serviceId),
    pagination: String(page),
  });
  if (locationTarget?.code) {
    searchParams.set('konum', locationTarget.code);
  }
  const url = `${PLUXEE_BASE_URL}/ajax/search-merchant?${searchParams.toString()}`;
  const payload = await fetchJson(url);
  await maybeWriteCache(cachePath, payload);
  return payload;
}

async function fetchMerchantDetail(urlPath) {
  if (!urlPath) return {};
  const absoluteUrl = new URL(urlPath, PLUXEE_BASE_URL).toString();
  const safeName = Buffer.from(absoluteUrl).toString('base64url');
  const cachePath = path.join(options.cacheDir, 'raw', 'details', `${safeName}.html`);
  const cached = await readText(cachePath);
  const html = cached || await fetchText(absoluteUrl);
  if (!cached) await maybeWriteTextCache(cachePath, html);
  return parsePluxeeDetailHtml(html);
}

async function fetchJson(url) {
  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'MyMultiSport Pluxee one-time import',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (response.ok) return response.json();
    if (!isRetryableStatus(response.status) || attempt > options.retries) {
      throw new Error(`Pluxee request failed ${response.status}: ${url}`);
    }
    const waitMs = options.retryDelayMs * attempt;
    console.warn(`retry_json status=${response.status} attempt=${attempt} wait_ms=${waitMs} url=${url}`);
    await sleep(waitMs);
  }
  throw new Error(`Pluxee request failed: ${url}`);
}

async function fetchText(url) {
  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'MyMultiSport Pluxee one-time import',
      },
    });
    if (response.ok) return response.text();
    if (!isRetryableStatus(response.status) || attempt > options.retries) {
      throw new Error(`Pluxee detail request failed ${response.status}: ${url}`);
    }
    const waitMs = options.retryDelayMs * attempt;
    console.warn(`retry_detail status=${response.status} attempt=${attempt} wait_ms=${waitMs} url=${url}`);
    await sleep(waitMs);
  }
  throw new Error(`Pluxee detail request failed: ${url}`);
}

async function writeSnapshot(snapshot, outDir) {
  await mkdir(path.join(outDir, 'cities'), { recursive: true });
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(snapshot.manifest, null, 2)}\n`);
  await writeFile(path.join(outDir, 'index-tr.json'), `${JSON.stringify(snapshot.index)}\n`);
  await writeFile(path.join(outDir, 'unmapped.json'), `${JSON.stringify(snapshot.unmapped, null, 2)}\n`);
  await Promise.all(Object.entries(snapshot.cityShards).map(([slug, places]) => (
    writeFile(path.join(outDir, 'cities', `${slug}.json`), `${JSON.stringify(places)}\n`)
  )));
}

function annotateRows(rows, page, locationTarget) {
  return rows.map((row) => ({ ...row, __sourcePage: page, __sourceLocation: locationTarget }));
}

function sourceCountKey(serviceId, locationTarget) {
  return locationTarget?.code ? `${serviceId}@${locationTarget.code}` : String(serviceId);
}

async function maybeWriteCache(filePath, payload) {
  if (options.noCache || options.dryRun) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload)}\n`);
}

async function maybeWriteTextCache(filePath, payload) {
  if (options.noCache || options.dryRun) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload);
}

async function readJson(filePath) {
  if (options.noCache) return null;
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(filePath) {
  if (options.noCache) return null;
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function parseArgs(args) {
  const parsed = {
    services: [],
    pages: undefined,
    details: undefined,
    dryRun: false,
    outDir: DEFAULT_OUT_DIR,
    cacheDir: DEFAULT_CACHE_DIR,
    delayMs: 120,
    timeoutMs: 15000,
    noCache: false,
    runId: '',
    locations: [],
    includeDefaultLocation: false,
    retries: 4,
    retryDelayMs: 3000,
  };

  for (const arg of args) {
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--no-cache') parsed.noCache = true;
    else if (arg.startsWith('--services=')) parsed.services = arg.split('=')[1].split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg.startsWith('--pages=')) parsed.pages = Number(arg.split('=')[1]);
    else if (arg.startsWith('--details=')) parsed.details = Number(arg.split('=')[1]);
    else if (arg.startsWith('--out-dir=')) parsed.outDir = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--cache-dir=')) parsed.cacheDir = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--delay-ms=')) parsed.delayMs = Number(arg.split('=')[1]);
    else if (arg.startsWith('--timeout-ms=')) parsed.timeoutMs = Number(arg.split('=')[1]);
    else if (arg.startsWith('--run-id=')) parsed.runId = arg.split('=')[1];
    else if (arg.startsWith('--locations=')) parsed.locations.push(...splitCsvArg(arg));
    else if (arg.startsWith('--cities=')) parsed.locations.push(...splitCsvArg(arg));
    else if (arg.startsWith('--location-group=')) parsed.locations.push(...splitCsvArg(arg));
    else if (arg === '--include-default-location') parsed.includeDefaultLocation = true;
    else if (arg.startsWith('--retries=')) parsed.retries = Number(arg.split('=')[1]);
    else if (arg.startsWith('--retry-delay-ms=')) parsed.retryDelayMs = Number(arg.split('=')[1]);
  }

  if (Number.isNaN(parsed.pages)) parsed.pages = undefined;
  if (Number.isNaN(parsed.details)) parsed.details = undefined;
  if (!Number.isFinite(parsed.delayMs)) parsed.delayMs = 120;
  if (!Number.isFinite(parsed.timeoutMs)) parsed.timeoutMs = 15000;
  if (!Number.isFinite(parsed.retries)) parsed.retries = 4;
  if (!Number.isFinite(parsed.retryDelayMs)) parsed.retryDelayMs = 3000;
  return parsed;
}

function splitCsvArg(arg) {
  return arg.split('=').slice(1).join('=').split(',').map((value) => value.trim()).filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 403 || status === 408 || status === 429 || status >= 500;
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
