import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getScopedStorageKey, getStorageScope } from './storageScope';

export const CLOUD_CYCLE_PAYLOAD_KEY = 'cloudCyclePayload';
export const CLOUD_CYCLE_META_KEY = 'cloudCycleMeta';

/** One account or anonymous scope plus the workspace that owns the handoff. */
export interface CloudSessionScope {
  userId?: string | null;
  workspaceId: ForecastWorkspaceId;
}

/**
 * Returns the session key holding one workspace's pending cloud handoff.
 * Each workspace owns its own slot so a Severe mount can never read, overwrite,
 * or clear a handoff staged for Custom, and vice versa.
 */
export const getCloudSessionStorageKey = (
  baseKey: string,
  { userId, workspaceId }: CloudSessionScope,
): string => getScopedStorageKey(`${baseKey}:${workspaceId}`, getStorageScope(userId));

/** Drops one stored value, ignoring unavailable browser storage. */
export const removeCloudSessionStorageValue = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return; // storage is unavailable; the stale copy is harmless
  }
};

/**
 * Removes the handoff copies owned by one workspace plus the pre-workspace
 * anonymous copies, leaving every other workspace's staged handoff in place.
 */
export const clearCloudSessionStorage = ({ userId, workspaceId }: CloudSessionScope): void => {
  for (const baseKey of [CLOUD_CYCLE_PAYLOAD_KEY, CLOUD_CYCLE_META_KEY]) {
    removeCloudSessionStorageValue(getCloudSessionStorageKey(baseKey, { userId, workspaceId }));
    if (!userId) removeCloudSessionStorageValue(baseKey);
  }
};
