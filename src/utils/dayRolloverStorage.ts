import { DEFAULT_FORECAST_WORKSPACE, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getStorageScope, getScopedStorageKey } from './storageScope';

export interface DayRolloverPromptState {
  previousDay: string;
  currentDay: string;
}

export const DAY_ROLLOVER_LAST_ACTIVE_KEY = 'gfc-last-active-local-day';
export const DAY_ROLLOVER_PROMPTED_KEY = 'gfc-day-rollover-prompt-day';
export const DAY_ROLLOVER_PENDING_KEY = 'gfc-day-rollover-pending';
export const DAY_ROLLOVER_CHECK_INTERVAL_MS = 60_000;

type StoredRolloverPrompt = DayRolloverPromptState;

const parseRolloverPrompt = (stored: string | null): StoredRolloverPrompt | null => {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<StoredRolloverPrompt>;
    return typeof parsed.previousDay === 'string' && typeof parsed.currentDay === 'string'
      ? { previousDay: parsed.previousDay, currentDay: parsed.currentDay }
      : null;
  } catch {
    return null;
  }
};

/** Returns the localStorage key for rollover state in one account scope and one workspace. */
export function getRolloverStorageKey(
  key: string,
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): string {
  return getScopedStorageKey(`${key}:${workspaceId}`, getStorageScope(userId));
}

/** Returns the pre-workspace key shape shared by every workspace in one account scope. */
export function getLegacyRolloverStorageKey(key: string, userId?: string | null): string {
  return getScopedStorageKey(key, getStorageScope(userId));
}

/** Reads one stored day string from localStorage, returning null when storage is unavailable. */
export function readStoredDayValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Persists one day string into localStorage, ignoring storage errors. */
export function writeStoredDayValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures so the editor keeps functioning.
  }
}

/** Removes one stored value, ignoring storage errors. */
export function removeStoredDayValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Reads a pre-workspace rollover day. The legacy key never named a workspace, so only the
 * default workspace may claim it: handing the same shared value to every workspace would
 * prompt each one for a rollover it never detected. The account-scoped copy is preferred,
 * and the unscoped copy only ever belonged to anonymous use.
 */
export function readLegacyRolloverDayValue(
  key: string,
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): string | null {
  if (workspaceId !== DEFAULT_FORECAST_WORKSPACE) return null;
  const accountScoped = readStoredDayValue(getLegacyRolloverStorageKey(key, userId));
  if (accountScoped !== null) return accountScoped;
  return userId ? null : readStoredDayValue(key);
}

/** Reads a pre-workspace pending prompt for the default workspace only, using the same ownership rule as the day keys. */
export function readLegacyRolloverPrompt(
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): StoredRolloverPrompt | null {
  return parseRolloverPrompt(readLegacyRolloverDayValue(DAY_ROLLOVER_PENDING_KEY, userId, workspaceId));
}

/** Reads a pending rollover prompt for one workspace, ignoring malformed or unavailable storage. */
export function readStoredRolloverPrompt(
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): StoredRolloverPrompt | null {
  return parseRolloverPrompt(readStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, userId, workspaceId)));
}

/** Persists a pending rollover prompt for one account scope and workspace. */
export function writeStoredRolloverPrompt(
  prompt: StoredRolloverPrompt,
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): void {
  writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, userId, workspaceId), JSON.stringify(prompt));
}

/** Removes a pending rollover prompt for one account scope and workspace. */
export function clearStoredRolloverPrompt(
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): void {
  removeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, userId, workspaceId));
}
