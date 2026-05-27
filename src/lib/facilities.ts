import type {
  BenefitActivityGroup,
  BenefitFacility,
  FacilityResult,
  FilterState,
  GoogleOpeningHours,
  GoogleRatingMatch,
  UserFacilityState,
  UserLocation,
} from '../types';
import type { LanguageCode } from './i18n';
import { getWeekdayLabel, translate } from './i18n';

const BENEFIT_FACILITY_DETAIL_BASE = 'https://benefitsystems.com.tr/tesisler/';
const PLUXEE_DATA_BASE = '/data/providers/pluxee';
const PROVIDER_CACHE_NAME = 'mymultisport-provider-data-v1';
const DEFAULT_TIME_ZONE = 'Europe/Istanbul';
const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;

const collator = new Intl.Collator('tr', { sensitivity: 'base' });

export async function loadFacilities(): Promise<BenefitFacility[]> {
  const response = await fetch('/data/facilities-tr.json', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Tesis listesi yüklenemedi (${response.status})`);
  }

  const facilities = (await response.json()) as BenefitFacility[];
  return facilities
    .map((facility) => ({ ...facility, provider: 'multisport' as const }))
    .filter(isUsableFacility);
}

export async function loadPluxeeFacilities(): Promise<BenefitFacility[]> {
  const manifest = await fetchCachedJson<{ snapshotVersion?: string }>(`${PLUXEE_DATA_BASE}/manifest.json`);
  const facilities = await fetchCachedJson<BenefitFacility[]>(
    `${PLUXEE_DATA_BASE}/index-tr.json`,
    manifest.snapshotVersion,
  );
  return facilities
    .map((facility) => ({ ...facility, provider: 'pluxee' as const }))
    .filter(isUsableFacility);
}

export async function loadPluxeeCityShard(citySlug: string): Promise<BenefitFacility[]> {
  const manifest = await fetchCachedJson<{ snapshotVersion?: string }>(`${PLUXEE_DATA_BASE}/manifest.json`);
  const facilities = await fetchCachedJson<BenefitFacility[]>(
    `${PLUXEE_DATA_BASE}/cities/${encodeURIComponent(citySlug)}.json`,
    manifest.snapshotVersion,
  );
  return facilities
    .map((facility) => ({ ...facility, provider: 'pluxee' as const }))
    .filter(isUsableFacility);
}

async function fetchCachedJson<T>(url: string, version = ''): Promise<T> {
  const versionedUrl = version ? `${url}?v=${encodeURIComponent(version)}` : url;

  if (!('caches' in globalThis)) {
    const response = await fetch(versionedUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Veri yüklenemedi (${response.status}): ${url}`);
    return response.json();
  }

  const cache = await caches.open(PROVIDER_CACHE_NAME);
  const cached = await cache.match(versionedUrl);
  if (cached) return cached.json();

  const response = await fetch(versionedUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Veri yüklenemedi (${response.status}): ${url}`);
  await cache.put(versionedUrl, response.clone());
  return response.json();
}

export function isUsableFacility(facility: BenefitFacility): boolean {
  return (
    Boolean(facility.id) &&
    Boolean(facility.name) &&
    Number.isFinite(facility.lat) &&
    Number.isFinite(facility.lng)
  );
}

export function buildFacilityResults(
  facilities: BenefitFacility[],
  ratings: Record<string, GoogleRatingMatch>,
  userLocation?: UserLocation,
  userStates: Record<string, UserFacilityState> = {},
): FacilityResult[] {
  return facilities.map((facility) => ({
    facility,
    rating: ratings[facility.id],
    distanceKm: userLocation ? distanceKm(userLocation, facility) : undefined,
    userState: userStates[facility.id],
  }));
}

export function filterAndSortFacilities(results: FacilityResult[], filters: FilterState): FacilityResult[] {
  const query = normalize(filters.query);
  const city = normalize(filters.city);
  const district = normalize(filters.district);
  const activity = normalize(filters.activity);

  const filtered = results.filter((result) => {
    const { facility, rating, distanceKm: distance } = result;
    if (city && normalize(facility.city) !== city) return false;
    if (district && normalize(facility.cityDistrict) !== district) return false;
    if (activity && !getActivityNames(facility.activityGroups).some((name) => normalize(name) === activity)) {
      return false;
    }
    if (query && !searchText(facility).includes(query)) return false;
    if (filters.card && !facility.cards.some((card) => normalize(card) === normalize(filters.card))) return false;
    if (filters.amenity && !facility.amenities.some((amenity) => normalize(amenity) === normalize(filters.amenity))) return false;
    if (filters.providerService && !facility.services?.includes(filters.providerService)) return false;
    if (filters.serviceMode && !facility.serviceModes?.includes(filters.serviceMode)) return false;
    if (filters.pluxeePlusOnly && !facility.pluxeePlus) return false;
    if (filters.openNowOnly && !facility.isOpenNow) return false;
    if (filters.hasPhoto && !facility.thumbnail) return false;
    if (filters.activeOnly && facility.status !== 1) return false;
    if (filters.internationalOnly && !facility.allowInternationalVisits) return false;
    if (filters.personal === 'favorite' && !result.userState?.favorite) return false;
    if (filters.personal === 'wantToGo' && !result.userState?.wantToGo) return false;
    if (filters.personal === 'visited' && !result.userState?.visited) return false;
    if (filters.personal === 'noted' && !result.userState?.note.trim()) return false;
    if (filters.radiusKm > 0 && distance !== undefined && distance > filters.radiusKm) return false;
    if (filters.minRating > 0 && (rating?.matchStatus !== 'matched' || (rating.rating ?? 0) < filters.minRating)) {
      return false;
    }
    if (filters.minReviews > 0 && (rating?.matchStatus !== 'matched' || (rating.userRatingCount ?? 0) < filters.minReviews)) {
      return false;
    }
    if (!matchesHoursFilter(result, filters)) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === 'recommended') {
      return recommendedScore(b, filters) - recommendedScore(a, filters)
        || collator.compare(a.facility.name, b.facility.name);
    }
    if (filters.sort === 'distance') {
      return (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER);
    }
    if (filters.sort === 'rating_desc') {
      return compareRating(b, a) || collator.compare(a.facility.name, b.facility.name);
    }
    if (filters.sort === 'reviews_desc') {
      return (b.rating?.userRatingCount ?? -1) - (a.rating?.userRatingCount ?? -1) || compareRating(b, a);
    }
    if (filters.sort === 'za') {
      return collator.compare(b.facility.name, a.facility.name);
    }
    return collator.compare(a.facility.name, b.facility.name);
  });
}

function compareRating(a: FacilityResult, b: FacilityResult): number {
  return (a.rating?.rating ?? -1) - (b.rating?.rating ?? -1)
    || (a.rating?.userRatingCount ?? -1) - (b.rating?.userRatingCount ?? -1);
}

function recommendedScore(result: FacilityResult, filters: FilterState): number {
  const { facility, rating, distanceKm: distance, userState } = result;
  const ratingScore = rating?.matchStatus === 'matched' ? ((rating.rating ?? 0) / 5) * 38 : 6;
  const reviewCount = rating?.matchStatus === 'matched' ? rating.userRatingCount ?? 0 : 0;
  const reviewScore = Math.min(Math.log10(reviewCount + 1) / Math.log10(1200), 1) * 18;
  const distanceScore = distance === undefined ? 8 : Math.max(0, 28 - distance * 1.4);
  const activityScore = filters.activity
    && getActivityNames(facility.activityGroups).some((name) => normalize(name) === normalize(filters.activity))
    ? 8
    : 0;
  const freshnessScore = facility.thumbnail ? 4 : 0;
  const activeScore = facility.status === 1 ? 4 : -18;
  const cardScore = filters.card && facility.cards.some((card) => normalize(card) === normalize(filters.card)) ? 4 : 0;
  const personalScore = (userState?.favorite ? 2 : 0) + (userState?.wantToGo ? 1.5 : 0) + (userState?.visited ? 1 : 0);
  return ratingScore + reviewScore + distanceScore + activityScore + freshnessScore + activeScore + cardScore + personalScore;
}

export function getActivityNames(groups: BenefitActivityGroup[] = []): string[] {
  const names = new Set<string>();
  groups.forEach((group) => group.activities?.forEach((activity) => names.add(activity.name)));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getPrimaryActivities(facility: BenefitFacility, limit = 3): string[] {
  return getActivityNames(facility.activityGroups).slice(0, limit);
}

export function getPrimaryAmenities(facility: BenefitFacility, limit = 3): string[] {
  return (facility.amenities || []).filter(Boolean).slice(0, limit);
}

export function getUniqueCities(facilities: BenefitFacility[]): string[] {
  return Array.from(new Set(facilities.map((facility) => facility.city).filter(Boolean)))
    .sort((a, b) => collator.compare(a, b));
}

export function getUniqueDistricts(facilities: BenefitFacility[], city: string): string[] {
  const normalizedCity = normalize(city);
  return Array.from(new Set(
    facilities
      .filter((facility) => !normalizedCity || normalize(facility.city) === normalizedCity)
      .map((facility) => facility.cityDistrict)
      .filter(Boolean),
  )).sort((a, b) => collator.compare(a, b));
}

export function getUniqueActivities(facilities: BenefitFacility[]): string[] {
  const names = new Set<string>();
  facilities.forEach((facility) => getActivityNames(facility.activityGroups).forEach((name) => names.add(name)));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getUniqueAmenities(facilities: BenefitFacility[]): string[] {
  const names = new Set<string>();
  facilities.forEach((facility) => facility.amenities?.forEach((amenity) => {
    if (amenity) names.add(amenity);
  }));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getUniqueCards(facilities: BenefitFacility[]): string[] {
  const names = new Set<string>();
  facilities.forEach((facility) => facility.cards?.forEach((card) => {
    if (card) names.add(card);
  }));
  return Array.from(names).sort((a, b) => collator.compare(a, b));
}

export function getUniqueServiceModes(facilities: BenefitFacility[]): string[] {
  const names = new Set<string>();
  facilities.forEach((facility) => facility.serviceModes?.forEach((mode) => {
    if (mode) names.add(mode);
  }));
  return Array.from(names).sort((a, b) => collator.compare(serviceModeLabel(a), serviceModeLabel(b)));
}

export function getFacilityDetailUrl(facility: BenefitFacility): string {
  if (facility.provider === 'pluxee') {
    return facility.sourceUrl || facility.slug || 'https://www.pluxee.com.tr/uye-isyerleri';
  }
  return new URL(facility.slug, BENEFIT_FACILITY_DETAIL_BASE).toString();
}

export function getGoogleMapsSearchUrl(facility: BenefitFacility, rating?: GoogleRatingMatch): string {
  const params = new URLSearchParams({ api: '1' });
  const query = buildMapsQuery(facility, rating);
  params.set('query', query);

  if (facility.googleMatch?.matchStatus === 'matched' && facility.googleMatch.googlePlaceId) {
    params.set('query_place_id', facility.googleMatch.googlePlaceId);
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }

  if (rating?.matchStatus === 'matched' && rating.placeId) {
    params.set('query_place_id', rating.placeId);
  }

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function formatOpeningHoursSummary(
  rating?: GoogleRatingMatch,
  languageOrNow: LanguageCode | Date = 'tr',
  now = new Date(),
): string | null {
  const language = languageOrNow instanceof Date ? 'tr' : languageOrNow;
  const referenceDate = languageOrNow instanceof Date ? languageOrNow : now;
  const hours = getOpeningHours(rating);
  if (!hours) return null;

  const reference = getLocalWeekMinute(referenceDate, getHoursTimeZone(hours));
  const periods = getNormalizedPeriods(hours);
  const activePeriod = periods.length > 0 ? findContainingPeriod(periods, reference.weekMinute) : undefined;
  const isOpen = activePeriod ? true : hours.openNow;

  if (isOpen === true) {
    if (!activePeriod) return translate(language, 'hoursSummary.open');
    return translate(language, 'hoursSummary.openUntil', {
      time: formatWeeklyTime(activePeriod.close, reference.day, language),
    });
  }

  if (isOpen === false) {
    const nextOpen = periods.length > 0 ? findNextOpeningMinute(periods, reference.weekMinute) : undefined;
    if (nextOpen === undefined) return translate(language, 'hoursSummary.closed');
    return translate(language, 'hoursSummary.opensAt', {
      time: formatWeeklyTime(nextOpen, reference.day, language),
    });
  }

  return null;
}

export function getOpeningWeekdayDescriptions(rating?: GoogleRatingMatch): string[] {
  return getOpeningHours(rating)?.weekdayDescriptions || [];
}

export function normalize(value: string | undefined | null): string {
  return (value || '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchText(facility: BenefitFacility): string {
  return normalize([
    facility.name,
    facility.city,
    facility.cityDistrict,
    facility.address,
    facility.neighborhood,
    facility.category,
    facility.phone,
    ...getActivityNames(facility.activityGroups),
    ...facility.amenities,
    ...facility.discounts,
    ...facility.cards,
    ...(facility.services || []).map(serviceLabel),
    ...(facility.serviceModes || []).map(serviceModeLabel),
  ].join(' '));
}

function buildMapsQuery(facility: BenefitFacility, rating?: GoogleRatingMatch): string {
  const exactName = rating?.matchStatus === 'matched' && rating.displayName ? rating.displayName : facility.name;
  const address = rating?.matchStatus === 'matched' && rating.formattedAddress ? rating.formattedAddress : facility.address;
  const parts = [exactName, address, facility.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : `${facility.lat},${facility.lng}`;
}

export function serviceLabel(serviceId: string): string {
  if (serviceId === '3') return 'Pluxee Yemek';
  if (serviceId === '4') return 'Pluxee Business';
  if (serviceId === '9') return 'Pluxee Gıda';
  return `Pluxee ${serviceId}`;
}

export function serviceModeLabel(value: string): string {
  if (value === 'paket') return 'Paket servis';
  if (value === 'masa') return 'Masa servisi';
  if (value === 'alGotur') return 'Al-Götür';
  if (value === 'catering') return 'Catering';
  return value;
}

export function pluxeeCitySlug(city: string): string {
  return normalize(city).replace(/\s+/g, '-') || 'unknown';
}

function matchesHoursFilter(result: FacilityResult, filters: FilterState): boolean {
  if (!filters.hoursMode) return true;

  const hours = getOpeningHours(result.rating);
  if (!hours) return false;

  const periods = getNormalizedPeriods(hours);
  const reference = getLocalWeekMinute(new Date(), getHoursTimeZone(hours));
  const isOpenNow = periods.length > 0
    ? Boolean(findContainingPeriod(periods, reference.weekMinute))
    : hours.openNow;

  if (filters.hoursMode === 'open_now') return isOpenNow === true;
  if (filters.hoursMode === 'closed_now') return isOpenNow === false;
  if (periods.length === 0) return false;

  const startTime = parseTimeMinutes(filters.hoursTime);
  const endTime = parseTimeMinutes(filters.hoursEndTime);
  if (startTime === undefined) return false;

  const dayStart = reference.day * DAY_MINUTES;

  if (filters.hoursMode === 'open_at') {
    return isOpenAtWeekMinute(periods, dayStart + startTime);
  }

  if (filters.hoursMode === 'open_until') {
    let end = dayStart + startTime;
    if (end <= reference.weekMinute) end += DAY_MINUTES;
    return isOpenContinuouslyBetween(periods, reference.weekMinute, end);
  }

  if (filters.hoursMode === 'open_between') {
    if (endTime === undefined) return false;
    const start = dayStart + startTime;
    let end = dayStart + endTime;
    if (end <= start) end += DAY_MINUTES;
    return isOpenContinuouslyBetween(periods, start, end);
  }

  return true;
}

function getOpeningHours(rating?: GoogleRatingMatch): GoogleOpeningHours | undefined {
  if (!rating || rating.matchStatus !== 'matched') return undefined;

  if (rating.openingHours) return rating.openingHours;

  const current = rating.currentOpeningHours;
  const regular = rating.regularOpeningHours;
  if (!current && !regular) return undefined;

  return {
    openNow: current?.openNow ?? regular?.openNow,
    nextCloseTime: current?.nextCloseTime,
    nextOpenTime: current?.nextOpenTime,
    weekdayDescriptions: current?.weekdayDescriptions?.length ? current.weekdayDescriptions : regular?.weekdayDescriptions,
    periods: regular?.periods?.length ? regular.periods : current?.periods,
    timeZone: current?.timeZone || regular?.timeZone || DEFAULT_TIME_ZONE,
    utcOffsetMinutes: current?.utcOffsetMinutes ?? regular?.utcOffsetMinutes ?? rating.utcOffsetMinutes,
  };
}

function getHoursTimeZone(hours: GoogleOpeningHours): string {
  return hours.timeZone || DEFAULT_TIME_ZONE;
}

function getNormalizedPeriods(hours: GoogleOpeningHours): Array<{ open: number; close: number }> {
  return (hours.periods || [])
    .map((period) => {
      if (!period.open || !isValidWeekPoint(period.open)) return null;
      const open = (Number(period.open.day) * DAY_MINUTES) + (Number(period.open.hour) * 60) + Number(period.open.minute || 0);

      if (!period.close) {
        return { open: 0, close: WEEK_MINUTES };
      }

      if (!isValidWeekPoint(period.close)) return null;
      let close = (Number(period.close.day) * DAY_MINUTES) + (Number(period.close.hour) * 60) + Number(period.close.minute || 0);
      if (close <= open) close += WEEK_MINUTES;
      return { open, close };
    })
    .filter((period): period is { open: number; close: number } => Boolean(period));
}

function isValidWeekPoint(point: { day?: number; hour?: number; minute?: number }): boolean {
  return Number.isInteger(point.day)
    && Number(point.day) >= 0
    && Number(point.day) <= 6
    && Number.isInteger(point.hour)
    && Number(point.hour) >= 0
    && Number(point.hour) <= 23
    && (!point.minute || (Number.isInteger(point.minute) && Number(point.minute) >= 0 && Number(point.minute) <= 59));
}

function findContainingPeriod(periods: Array<{ open: number; close: number }>, weekMinute: number) {
  for (const period of periods) {
    for (const candidate of [weekMinute, weekMinute + WEEK_MINUTES]) {
      if (period.open <= candidate && candidate < period.close) return period;
    }
  }
  return undefined;
}

function findNextOpeningMinute(periods: Array<{ open: number; close: number }>, weekMinute: number): number | undefined {
  let best: number | undefined;
  for (const period of periods) {
    for (const offset of [0, WEEK_MINUTES, WEEK_MINUTES * 2]) {
      const candidate = period.open + offset;
      if (candidate <= weekMinute) continue;
      if (best === undefined || candidate < best) best = candidate;
    }
  }
  return best;
}

function isOpenAtWeekMinute(periods: Array<{ open: number; close: number }>, weekMinute: number): boolean {
  return Boolean(findContainingPeriod(periods, weekMinute));
}

function isOpenContinuouslyBetween(periods: Array<{ open: number; close: number }>, start: number, end: number): boolean {
  if (end <= start) return false;
  return periods.some((period) => [start, start + WEEK_MINUTES].some((candidateStart) => {
    const candidateEnd = candidateStart + (end - start);
    return period.open <= candidateStart && candidateEnd <= period.close;
  }));
}

function parseTimeMinutes(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getLocalWeekMinute(date: Date, timeZone: string): { day: number; weekMinute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Sun';
    const hourValue = Number(parts.find((part) => part.type === 'hour')?.value || '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    const hour = hourValue === 24 ? 0 : hourValue;
    const normalizedDay = day >= 0 ? day : 0;
    return {
      day: normalizedDay,
      weekMinute: normalizedDay * DAY_MINUTES + hour * 60 + minute,
    };
  } catch {
    if (timeZone !== DEFAULT_TIME_ZONE) return getLocalWeekMinute(date, DEFAULT_TIME_ZONE);
    const day = date.getDay();
    return {
      day,
      weekMinute: day * DAY_MINUTES + date.getHours() * 60 + date.getMinutes(),
    };
  }
}

function formatWeeklyTime(weekMinute: number, referenceDay: number, language: LanguageCode): string {
  const normalized = ((weekMinute % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  const day = Math.floor(normalized / DAY_MINUTES);
  const minuteOfDay = normalized % DAY_MINUTES;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return day === referenceDay ? time : `${getWeekdayLabel(day, language)} ${time}`;
}

export function distanceKm(from: UserLocation, to: Pick<BenefitFacility, 'lat' | 'lng'>): number {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(to.lat - from.lat);
  const dLng = degreesToRadians(to.lng - from.lng);
  const lat1 = degreesToRadians(from.lat);
  const lat2 = degreesToRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}
