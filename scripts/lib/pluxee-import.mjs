import crypto from 'node:crypto';

export const PLUXEE_BASE_URL = 'https://www.pluxee.com.tr';

export const PLUXEE_SERVICES = {
  3: { id: '3', label: 'Pluxee Yemek', slug: 'yemek' },
  4: { id: '4', label: 'Pluxee Business', slug: 'business' },
  9: { id: '9', label: 'Pluxee Gıda', slug: 'gida' },
};

const SERVICE_MODES = [
  ['paket', ['paket servis', 'paket']],
  ['masa', ['masa servisi', 'masaya servis', 'masa']],
  ['alGotur', ['al-gotur', 'al gotur', 'al-götür', 'al götür']],
  ['catering', ['catering']],
];

export function normalizePluxeeMerchant({ serviceId, sourcePage, row, detail = {} }) {
  const service = PLUXEE_SERVICES[String(serviceId)] || { id: String(serviceId), label: `Pluxee ${serviceId}`, slug: String(serviceId) };
  const location = parseDisplayLocation(row.display_location || detail.displayLocation || '');
  const sourceUrl = absolutePluxeeUrl(row.url || detail.url || '');
  const name = cleanText(row.display_name || detail.name || '');
  const category = cleanText(row.kitchen_type || detail.category || '');
  const address = cleanText(detail.address || '');
  const phone = cleanPhone(detail.phone || '');
  const serviceModes = Array.from(new Set([
    ...parseServiceModes(detail.rawText || ''),
    ...parseServiceModes(row.kitchen_type || ''),
  ]));
  const lat = finiteNumber(detail.lat);
  const lng = finiteNumber(detail.lng);
  const normalized = {
    id: `pluxee:${stableHash([sourceUrl, name, row.display_location || '', address].join('|')).slice(0, 16)}`,
    provider: 'pluxee',
    name,
    slug: sourceUrl,
    sourceUrl,
    lat,
    lng,
    thumbnail: cleanText(row.image_url || ''),
    address,
    phone,
    todayHours: cleanText(detail.todayHours || ''),
    city: location.city,
    cityDistrict: location.district,
    neighborhood: location.neighborhood,
    category,
    activityGroups: category ? [{ name: 'Pluxee', activities: [{ name: category }] }] : [],
    discounts: row.has_promotion ? ['Pluxee Plus'] : [],
    amenities: serviceModes.map(serviceModeLabel),
    cards: [service.label],
    status: 1,
    desired: false,
    vcOnly: false,
    allowInternationalVisits: false,
    services: [service.id],
    serviceModes,
    pluxeePlus: Boolean(row.has_promotion),
    isOpenNow: Boolean(row.is_open),
    sourceStatus: 'current',
    importMeta: {
      sourcePage,
      serviceId: service.id,
      displayDistanceKm: parseDistance(row.display_distance),
      icon: cleanText(row.icon || ''),
      branchId: row.branchId ?? null,
    },
  };

  normalized.fingerprint = fingerprintPluxeePlace(normalized);
  return normalized;
}

export function parseDisplayLocation(value) {
  const parts = cleanText(value)
    .split('/')
    .map((part) => titleCaseTr(part))
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      neighborhood: parts.slice(0, -2).join(' / '),
      district: parts.at(-2) || '',
      city: parts.at(-1) || '',
    };
  }

  if (parts.length === 2) {
    return {
      neighborhood: '',
      district: parts[0],
      city: parts[1],
    };
  }

  return {
    neighborhood: '',
    district: '',
    city: parts[0] || '',
  };
}

export function parseCoordinatesFromDetailHtml(html) {
  const decoded = decodeHtml(html);
  const match = /google\.com\/maps\?q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i.exec(decoded)
    || /maps\?q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i.exec(decoded);
  if (!match) return {};
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!isValidCoordinate(lat, lng)) return {};
  return { lat, lng };
}

export function parsePluxeeDetailHtml(html) {
  const decoded = decodeHtml(html);
  const coordinates = parseCoordinatesFromDetailHtml(decoded);
  const rawText = cleanText(stripTags(decoded));
  const titleMatch = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(decoded);
  const headerMatch = /<div class="company-name[\s\S]*?<span>([\s\S]*?)<\/span>/i.exec(decoded);
  const headerText = headerMatch ? cleanText(stripTags(headerMatch[1])) : '';
  const headerParts = headerText.split(' - ').map(cleanText).filter(Boolean);
  const locationText = headerParts[0] || '';
  const category = headerParts.slice(1).join(' - ');

  return removeEmpty({
    ...coordinates,
    name: titleMatch ? cleanText(stripTags(titleMatch[1])) : '',
    displayLocation: locationText,
    category,
    address: extractPropertyValue(decoded, 'Adres'),
    phone: cleanPhone(extractPropertyValue(decoded, 'Telefon')),
    todayHours: extractTodayHours(rawText),
    rawText,
  });
}

export function buildPluxeeSnapshot(merchants, options = {}) {
  const runId = options.runId || timestampRunId();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const merged = mergePluxeeMerchants(merchants);
  const mapped = merged
    .filter((merchant) => isValidCoordinate(merchant.lat, merchant.lng))
    .sort(comparePluxeePlace);
  const unmapped = merged
    .filter((merchant) => !isValidCoordinate(merchant.lat, merchant.lng))
    .sort(comparePluxeePlace);
  const cities = Array.from(new Set(mapped.map((place) => place.city).filter(Boolean))).sort(compareTr);
  const cityShards = Object.fromEntries(cities.map((city) => [
    citySlug(city),
    mapped.filter((place) => place.city === city),
  ]));
  const serviceCounts = countServices(mapped);
  const manifest = {
    provider: 'pluxee',
    runId,
    snapshotVersion: generatedAt,
    generatedAt,
    source: {
      baseUrl: PLUXEE_BASE_URL,
      services: options.sourceServices || Object.keys(PLUXEE_SERVICES),
      sourceCounts: options.sourceCounts || {},
    },
    totalMapped: mapped.length,
    totalUnmapped: unmapped.length,
    serviceCounts,
    cities: cities.map((city) => ({
      city,
      slug: citySlug(city),
      count: cityShards[citySlug(city)].length,
    })),
  };

  return {
    manifest,
    index: mapped,
    cityShards,
    unmapped,
  };
}

export function mergePluxeeMerchants(merchants) {
  const byKey = new Map();
  for (const merchant of merchants.filter(Boolean)) {
    const key = pluxeeMergeKey(merchant);
    const current = byKey.get(key);
    byKey.set(key, current ? mergeTwoPluxeeMerchants(current, merchant) : merchant);
  }
  return Array.from(byKey.values());
}

export function fingerprintPluxeePlace(place) {
  return stableHash([
    place.id,
    place.name,
    place.address,
    place.city,
    place.cityDistrict,
    String(place.lat || ''),
    String(place.lng || ''),
    [...(place.services || [])].sort().join(','),
  ].join('|'));
}

export function citySlug(city) {
  return slugify(city || 'unknown');
}

export function serviceModeLabel(value) {
  if (value === 'paket') return 'Paket servis';
  if (value === 'masa') return 'Masa servisi';
  if (value === 'alGotur') return 'Al-Götür';
  if (value === 'catering') return 'Catering';
  return titleCaseTr(value);
}

export function serviceLabel(serviceId) {
  return PLUXEE_SERVICES[String(serviceId)]?.label || `Pluxee ${serviceId}`;
}

export function absolutePluxeeUrl(value) {
  if (!value) return '';
  try {
    return new URL(value, PLUXEE_BASE_URL).toString();
  } catch {
    return '';
  }
}

function mergeTwoPluxeeMerchants(a, b) {
  const services = uniqueSorted([...(a.services || []), ...(b.services || [])], (left, right) => Number(left) - Number(right));
  const serviceModes = uniqueSorted([...(a.serviceModes || []), ...(b.serviceModes || [])]);
  const cards = services.map(serviceLabel);
  const amenities = serviceModes.map(serviceModeLabel);
  const pluxeePlus = Boolean(a.pluxeePlus || b.pluxeePlus);
  const merged = {
    ...a,
    lat: finiteNumber(a.lat) ?? finiteNumber(b.lat),
    lng: finiteNumber(a.lng) ?? finiteNumber(b.lng),
    thumbnail: a.thumbnail || b.thumbnail || '',
    address: a.address || b.address || '',
    phone: a.phone || b.phone || '',
    category: a.category || b.category || '',
    activityGroups: a.activityGroups?.length ? a.activityGroups : b.activityGroups || [],
    discounts: pluxeePlus ? ['Pluxee Plus'] : [],
    amenities,
    cards,
    services,
    serviceModes,
    pluxeePlus,
    isOpenNow: Boolean(a.isOpenNow || b.isOpenNow),
    sourceUrls: uniqueSorted([a.sourceUrl, b.sourceUrl, ...(a.sourceUrls || []), ...(b.sourceUrls || [])].filter(Boolean)),
  };
  merged.fingerprint = fingerprintPluxeePlace(merged);
  return merged;
}

function pluxeeMergeKey(merchant) {
  if (merchant.sourceUrl) return normalizeKey(merchant.sourceUrl);
  return normalizeKey([merchant.name, merchant.address, merchant.cityDistrict, merchant.city].join('|'));
}

function countServices(places) {
  const counts = {};
  for (const place of places) {
    for (const service of place.services || []) {
      counts[service] = (counts[service] || 0) + 1;
    }
  }
  return counts;
}

function comparePluxeePlace(a, b) {
  return compareTr(a.city, b.city)
    || compareTr(a.cityDistrict, b.cityDistrict)
    || compareTr(a.name, b.name);
}

function parseServiceModes(text) {
  const normalized = normalizeKey(text);
  return SERVICE_MODES
    .filter(([, labels]) => labels.some((label) => normalized.includes(normalizeKey(label))))
    .map(([key]) => key);
}

function extractPropertyValue(html, label) {
  const decoded = decodeHtml(html);
  const re = new RegExp(`<h4[^>]*>\\s*${escapeRegExp(label)}\\s*<\\/h4>[\\s\\S]*?<li[^>]*>([\\s\\S]*?)<\\/li>`, 'i');
  const match = re.exec(decoded);
  return match ? cleanText(stripTags(match[1])) : '';
}

function extractTodayHours(text) {
  const match = /Bugün\s+([0-2]\d:[0-5]\d)\s*-\s*([0-2]\d:[0-5]\d)/i.exec(text);
  return match ? `${match[1]}-${match[2]}` : '';
}

function parseDistance(value) {
  const normalized = String(value || '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    && !(lat === 0 && lng === 0);
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timestampRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalizeKey(value) {
  return decodeHtml(String(value || ''))
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

function slugify(value) {
  return normalizeKey(value).replace(/\s+/g, '-') || 'unknown';
}

function titleCaseTr(value) {
  return cleanText(value)
    .toLocaleLowerCase('tr')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr') + word.slice(1))
    .join(' ');
}

function compareTr(a = '', b = '') {
  return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base' });
}

function uniqueSorted(values, compare = compareTr) {
  return Array.from(new Set(values.filter(Boolean))).sort(compare);
}

function removeEmpty(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== '' && entry !== undefined && entry !== null));
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ');
}

function cleanPhone(value) {
  return cleanText(value).replace(/[^\d+]/g, '');
}

function cleanText(value) {
  return decodeHtml(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
