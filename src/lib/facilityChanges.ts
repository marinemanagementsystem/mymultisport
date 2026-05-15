import type { FacilityChangeSummary } from '../types';

export async function loadFacilityChanges(): Promise<FacilityChangeSummary | null> {
  const response = await fetch('/data/facility-changes.json', {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Tesis değişim özeti yüklenemedi (${response.status})`);

  return response.json() as Promise<FacilityChangeSummary>;
}
