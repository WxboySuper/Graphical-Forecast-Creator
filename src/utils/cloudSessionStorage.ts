import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { classifyForecastWorkspacePayload } from './forecastWorkspacePersistence';
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

/** Reads one session value, treating unavailable browser storage as empty. */
const readCloudSessionValue = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Writes one session value, treating unavailable browser storage as a no-op. */
const writeCloudSessionValue = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return; // storage is unavailable; the value stays where it was
  }
};

/** One pre-workspace handoff pair, keyed the way the older build wrote it. */
interface LegacyCloudSessionPair {
  payloadKey: string;
  metaKey: string;
  /** Account the legacy key was scoped to, or null for the anonymous scope. */
  ownerUserId: string | null;
}

/**
 * Lists the pre-workspace handoff pairs this mount may adopt: the current
 * account scope, the anonymous scope, and the oldest unscoped keys.
 * Another account's keys are left alone so they never move into this scope.
 */
const listLegacyCloudSessionPairs = (userId?: string | null): LegacyCloudSessionPair[] => {
  const ownersByScope = new Map<string, string | null>([
    [getStorageScope(userId), userId ?? null],
    [getStorageScope(undefined), null],
  ]);
  const pairs = [...ownersByScope].map(([scope, ownerUserId]) => ({
    payloadKey: getScopedStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, scope),
    metaKey: getScopedStorageKey(CLOUD_CYCLE_META_KEY, scope),
    ownerUserId,
  }));
  pairs.push({ payloadKey: CLOUD_CYCLE_PAYLOAD_KEY, metaKey: CLOUD_CYCLE_META_KEY, ownerUserId: null });
  return pairs;
};

/** Resolves the workspace that owns a legacy payload, or null when it is unreadable. */
const resolveLegacyHandoffWorkspace = (payload: string): ForecastWorkspaceId | null => {
  try {
    const classification = classifyForecastWorkspacePayload(JSON.parse(payload) as unknown);
    return classification.ok ? classification.workspaceId : null;
  } catch {
    return null;
  }
};

/**
 * Copies one legacy handoff into the workspace slot of the scope it was keyed
 * for, but only while that slot is empty, so a handoff already staged under the
 * new keys keeps its value. Returns false when storage refused the write, which
 * tells the caller to leave the legacy copy alone instead of destroying it.
 */
const stageLegacyCloudSession = (
  payload: string,
  meta: string | null,
  { workspaceId, ownerUserId }: { workspaceId: ForecastWorkspaceId; ownerUserId: string | null },
): boolean => {
  const scope = { userId: ownerUserId, workspaceId };
  const targetPayloadKey = getCloudSessionStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, scope);
  const targetMetaKey = getCloudSessionStorageKey(CLOUD_CYCLE_META_KEY, scope);
  const targetIsFree = readCloudSessionValue(targetPayloadKey) === null
    && (meta === null || readCloudSessionValue(targetMetaKey) === null);
  if (!targetIsFree) return true;

  writeCloudSessionValue(targetPayloadKey, payload);
  if (meta !== null) writeCloudSessionValue(targetMetaKey, meta);
  return readCloudSessionValue(targetPayloadKey) === payload;
};

/**
 * Parks one pre-workspace handoff in the workspace slot that owns it, then
 * drops the legacy keys. A payload that will not parse or classify is dropped
 * instead of carried forward, and so is a meta entry with no payload to attach
 * to.
 */
const migrateLegacyCloudSessionPair = ({
  payloadKey,
  metaKey,
  ownerUserId,
}: LegacyCloudSessionPair): void => {
  const payload = readCloudSessionValue(payloadKey);
  const meta = readCloudSessionValue(metaKey);
  if (payload === null && meta === null) return;

  const workspaceId = payload === null ? null : resolveLegacyHandoffWorkspace(payload);
  const migrated = payload === null || workspaceId === null
    ? true
    : stageLegacyCloudSession(payload, meta, { workspaceId, ownerUserId });
  if (!migrated) return;

  removeCloudSessionStorageValue(payloadKey);
  removeCloudSessionStorageValue(metaKey);
};

/**
 * Moves the pre-workspace `cloudCyclePayload` / `cloudCycleMeta` keys into the
 * workspace-scoped slots before a restore reads them.
 *
 * Those keys carried no workspace, and the oldest of them carried no account
 * either. A key that already names the mounting account moves into that
 * account's slot, which is how a pending load survives the sign-in transition.
 * The anonymous and unscoped keys move into the anonymous slot: those were only
 * ever read signed out, and nothing in them says which account staged them, so
 * no account scope ever receives them.
 */
export const migrateLegacyCloudSessionStorage = (userId?: string | null): void => {
  for (const pair of listLegacyCloudSessionPairs(userId)) {
    migrateLegacyCloudSessionPair(pair);
  }
};
