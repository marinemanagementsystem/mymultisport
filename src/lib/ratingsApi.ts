import type { BenefitFacility, GoogleRatingMatch } from '../types';

const MAX_ENRICH_BATCH = 100;
const MAX_GET_BATCH = 100;
const CACHE_READ_CONCURRENCY = 4;

const configuredApiBase = (import.meta as any).env?.VITE_API_BASE_URL || '';

export const API_BASE_URL = configuredApiBase.replace(/\/$/, '');
export const RATINGS_API_AVAILABLE = Boolean(configuredApiBase)
  || !['localhost', '127.0.0.1', ''].includes(globalThis.location?.hostname || '');

export class RatingsApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'RatingsApiError';
    this.status = status;
    this.body = body;
  }
}

export async function getHealth(): Promise<{ ok: boolean; project?: string; time?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) throw new RatingsApiError(`API health hatası (${response.status})`, response.status);
  return response.json();
}

export async function getRatings(facilityIds: string[]): Promise<Record<string, GoogleRatingMatch>> {
  if (facilityIds.length === 0) return {};
  const searchParams = new URLSearchParams({ ids: facilityIds.join(',') });
  const response = await fetch(`${API_BASE_URL}/api/ratings?${searchParams.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new RatingsApiError(`Puan cache okunamadı (${response.status})`, response.status);
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

export async function enrichRatings(facilities: BenefitFacility[]): Promise<Record<string, GoogleRatingMatch>> {
  if (facilities.length === 0) return {};
  const response = await fetch(`${API_BASE_URL}/api/ratings/enrich`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      facilities: facilities.slice(0, MAX_ENRICH_BATCH).map((facility) => ({
        id: facility.id,
        name: facility.name,
        address: facility.address,
        city: facility.city,
        cityDistrict: facility.cityDistrict,
        lat: facility.lat,
        lng: facility.lng,
      })),
    }),
  });

  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { /* ignore */ }
    throw new RatingsApiError(
      `Google puanları güncellenemedi (${response.status})`,
      response.status,
      body,
    );
  }

  const payload = await response.json() as { ratings: GoogleRatingMatch[] };
  return Object.fromEntries((payload.ratings || []).map((rating) => [rating.facilityId, rating]));
}

export const ENRICH_BATCH_SIZE = MAX_ENRICH_BATCH;
