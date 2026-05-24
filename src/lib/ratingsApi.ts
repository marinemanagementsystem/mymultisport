import type {
  AdminRatingsStatus,
  BenefitFacility,
  GoogleRatingMatch,
  RatingsSnapshotResponse,
} from '../types';
import type { TranslationKey } from './i18n';

const MAX_ENRICH_BATCH = 50;
const MAX_GET_BATCH = 100;
const CACHE_READ_CONCURRENCY = 4;

const configuredApiBase = (import.meta as any).env?.VITE_API_BASE_URL || '';

export const API_BASE_URL = configuredApiBase.replace(/\/$/, '');
export const RATINGS_API_AVAILABLE = Boolean(configuredApiBase)
  || !['localhost', '127.0.0.1', ''].includes(globalThis.location?.hostname || '');

export class RatingsApiError extends Error {
  status: number;
  body?: unknown;
  messageKey?: TranslationKey;
  constructor(message: string, status: number, body?: unknown, messageKey?: TranslationKey) {
    super(message);
    this.name = 'RatingsApiError';
    this.status = status;
    this.body = body;
    this.messageKey = messageKey;
  }
}

export async function getHealth(): Promise<{ ok: boolean; project?: string; time?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new RatingsApiError(
      `API health failed (${response.status})`,
      response.status,
      undefined,
      'errors.apiHealthFailed',
    );
  }
  return response.json();
}

export async function getRatings(facilityIds: string[]): Promise<Record<string, GoogleRatingMatch>> {
  if (facilityIds.length === 0) return {};
  const searchParams = new URLSearchParams({ ids: facilityIds.join(',') });
  const response = await fetch(`${API_BASE_URL}/api/ratings?${searchParams.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new RatingsApiError(
      `Rating cache could not be read (${response.status})`,
      response.status,
      undefined,
      'errors.ratingsCacheFailedStatus',
    );
  }

  const payload = await response.json() as { ratings: GoogleRatingMatch[] };
  return Object.fromEntries((payload.ratings || []).map((rating) => [rating.facilityId, rating]));
}

export async function getAllRatings(
  facilityIds: string[],
  options?: { signal?: AbortSignal; onChunk?: (chunk: Record<string, GoogleRatingMatch>) => void },
): Promise<Record<string, GoogleRatingMatch>> {
  if (facilityIds.length === 0) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < facilityIds.length; i += MAX_GET_BATCH) {
    chunks.push(facilityIds.slice(i, i + MAX_GET_BATCH));
  }

  const merged: Record<string, GoogleRatingMatch> = {};
  let cursor = 0;

  const worker = async () => {
    while (cursor < chunks.length) {
      if (options?.signal?.aborted) return;
      const idx = cursor++;
      const chunk = chunks[idx];
      const result = await getRatings(chunk);
      if (options?.signal?.aborted) return;
      Object.assign(merged, result);
      options?.onChunk?.(result);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CACHE_READ_CONCURRENCY, chunks.length) }, () => worker()),
  );
  return merged;
}

export async function getRatingsSnapshot(
  options?: { signal?: AbortSignal },
): Promise<RatingsSnapshotResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ratings/snapshot`, {
    headers: { Accept: 'application/json' },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new RatingsApiError(
      `Rating snapshot could not be read (${response.status})`,
      response.status,
      undefined,
      'errors.ratingsCacheFailedStatus',
    );
  }

  return response.json();
}

export interface AdminCredentials {
  username: string;
  password: string;
}

export type AdminEnrichMode = 'delta' | 'missing' | 'selected';

export async function getAdminRatingsStatus(credentials: AdminCredentials): Promise<AdminRatingsStatus> {
  const response = await fetch(`${API_BASE_URL}/api/admin/ratings/status`, {
    headers: {
      Accept: 'application/json',
      Authorization: basicAuth(credentials),
    },
  });
  return parseAdminResponse(response, 'Admin status could not be read');
}

export async function rebuildRatingSnapshot(
  credentials: AdminCredentials,
): Promise<RatingsSnapshotResponse['meta']> {
  const response = await fetch(`${API_BASE_URL}/api/admin/ratings/snapshot/rebuild`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: basicAuth(credentials),
    },
  });
  const payload = await parseAdminResponse<{ meta: RatingsSnapshotResponse['meta'] }>(
    response,
    'Rating snapshot could not be rebuilt',
  );
  return payload.meta;
}

export async function adminEnrichRatings(
  credentials: AdminCredentials,
  facilities: BenefitFacility[],
  mode: AdminEnrichMode,
): Promise<Record<string, GoogleRatingMatch>> {
  if (facilities.length === 0) return {};
  const response = await fetch(`${API_BASE_URL}/api/admin/ratings/enrich`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: basicAuth(credentials),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode,
      facilities: facilities.slice(0, MAX_ENRICH_BATCH).map(toRatingFacilityPayload),
    }),
  });
  const payload = await parseAdminResponse<{ ratings: GoogleRatingMatch[] }>(
    response,
    `Google ratings could not be updated (${response.status})`,
  );
  return Object.fromEntries((payload.ratings || []).map((rating) => [rating.facilityId, rating]));
}

export async function enrichRatings(facilities: BenefitFacility[]): Promise<Record<string, GoogleRatingMatch>> {
  if (facilities.length === 0) return {};
  const response = await fetch(`${API_BASE_URL}/api/ratings/enrich`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      facilities: facilities.slice(0, MAX_ENRICH_BATCH).map(toRatingFacilityPayload),
    }),
  });

  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { /* ignore */ }
    throw new RatingsApiError(
      `Google ratings could not be updated (${response.status})`,
      response.status,
      body,
      'errors.ratingsEnrichFailedStatus',
    );
  }

  const payload = await response.json() as { ratings: GoogleRatingMatch[] };
  return Object.fromEntries((payload.ratings || []).map((rating) => [rating.facilityId, rating]));
}

function toRatingFacilityPayload(facility: BenefitFacility) {
  return {
    id: facility.id,
    name: facility.name,
    address: facility.address,
    city: facility.city,
    cityDistrict: facility.cityDistrict,
    lat: facility.lat,
    lng: facility.lng,
  };
}

async function parseAdminResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { /* ignore */ }
    throw new RatingsApiError(fallbackMessage, response.status, body, 'errors.ratingsEnrichFailedStatus');
  }
  return response.json();
}

function basicAuth(credentials: AdminCredentials): string {
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
}

export function getFacilityFingerprint(facility: BenefitFacility): string {
  return JSON.stringify([
    normalizeForFingerprint(facility.id),
    normalizeForFingerprint(facility.name),
    normalizeForFingerprint(facility.address),
    normalizeForFingerprint(facility.city),
    normalizeForFingerprint(facility.cityDistrict),
    normalizeCoordinate(facility.lat),
    normalizeCoordinate(facility.lng),
  ]);
}

function normalizeForFingerprint(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeCoordinate(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : null;
}

export const ENRICH_BATCH_SIZE = MAX_ENRICH_BATCH;
