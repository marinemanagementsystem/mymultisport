import type { FacilityPersonalKey, UserFacilityState } from '../types';

const STORAGE_KEY = 'mymultisport-user-facility-states-v1';

export function loadUserFacilityStates(): Record<string, UserFacilityState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<UserFacilityState>>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([facilityId]) => Boolean(facilityId))
        .map(([facilityId, value]) => [facilityId, normalizeState(facilityId, value)]),
    );
  } catch {
    return {};
  }
}

export function saveUserFacilityStates(states: Record<string, UserFacilityState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

export function toggleFacilityFlag(
  states: Record<string, UserFacilityState>,
  facilityId: string,
  key: FacilityPersonalKey,
): Record<string, UserFacilityState> {
  const current = normalizeState(facilityId, states[facilityId]);
  return cleanStates({
    ...states,
    [facilityId]: {
      ...current,
      [key]: !current[key],
      updatedAt: new Date().toISOString(),
    },
  });
}

export function updateFacilityNote(
  states: Record<string, UserFacilityState>,
  facilityId: string,
  note: string,
): Record<string, UserFacilityState> {
  const current = normalizeState(facilityId, states[facilityId]);
  return cleanStates({
    ...states,
    [facilityId]: {
      ...current,
      note,
      updatedAt: new Date().toISOString(),
    },
  });
}

function normalizeState(facilityId: string, state?: Partial<UserFacilityState>): UserFacilityState {
  return {
    facilityId,
    favorite: Boolean(state?.favorite),
    wantToGo: Boolean(state?.wantToGo),
    visited: Boolean(state?.visited),
    note: typeof state?.note === 'string' ? state.note : '',
    updatedAt: typeof state?.updatedAt === 'string' ? state.updatedAt : new Date().toISOString(),
  };
}

function cleanStates(states: Record<string, UserFacilityState>): Record<string, UserFacilityState> {
  return Object.fromEntries(
    Object.entries(states).filter(([, state]) => (
      state.favorite || state.wantToGo || state.visited || state.note.trim()
    )),
  );
}
