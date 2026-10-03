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
 * Returns whether the unscoped legacy handoff belongs to the workspace being
 * cleared. Those keys carry no workspace, so a payload that will not classify
 * and a meta entry with no payload both stay put: neither can be attributed to
 * this workspace, and deleting either would destroy the only copy.
 */
const ownsLegacyCloudSessionPair = (workspaceId: ForecastWorkspaceId): boolean => {
  const payload = readCloudSessionValue(CLOUD_CYCLE_PAYLOAD_KEY);
  if (payload === null) return false;
  const owner = resolveLegacyHandoffWorkspace(payload);
  return owner !== null && owner === workspaceId;
};

/**
 * Removes the handoff copies owned by one workspace, plus the unscoped
 * pre-workspace pair when its payload belongs to that same workspace. Every
 * other workspace's staged handoff and any unattributable legacy value stays in
 * place.
 */
export const clearCloudSessionStorage = ({ userId, workspaceId }: CloudSessionScope): void => {
  for (const baseKey of [CLOUD_CYCLE_PAYLOAD_KEY, CLOUD_CYCLE_META_KEY]) {
    removeCloudSessionStorageValue(getCloudSessionStorageKey(baseKey, { userId, workspaceId }));
  }
  if (userId || !ownsLegacyCloudSessionPair(workspaceId)) return;
  removeCloudSessionStorageValue(CLOUD_CYCLE_PAYLOAD_KEY);
  removeCloudSessionStorageValue(CLOUD_CYCLE_META_KEY);
};

/** One legacy handoff and the workspace slot it wants to move into. */
interface LegacyCloudHandoff {
  payload: string;
  meta: string | null;
  workspaceId: ForecastWorkspaceId;
  /** Account the legacy key was scoped to, or null for the anonymous scope. */
  ownerUserId: string | null;
}

/**
 * Copies one legacy handoff into the workspace slot of the scope it was keyed
 * for. Returns true when the legacy copy is safe to drop: either the write
 * landed, or a payload already staged under the new keys superseded it. Returns
 * false when nothing could be written, so the caller keeps the only copy.
 * Existing target values are never overwritten.
 */
const stageLegacyCloudSession = ({ payload, meta, workspaceId, ownerUserId }: LegacyCloudHandoff): boolean => {
  const scope = { userId: ownerUserId, workspaceId };
  const targetPayloadKey = getCloudSessionStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, scope);
  const targetMetaKey = getCloudSessionStorageKey(CLOUD_CYCLE_META_KEY, scope);

  // A payload already staged under the new keys is newer, so it wins and the
  // legacy copy is superseded without touching it.
  if (readCloudSessionValue(targetPayloadKey) !== null) return true;

  // The payload slot is free but the metadata slot is taken, so writing would
  // pair this payload with someone else's metadata whether or not the legacy
  // pair carries metadata of its own. Dropping the legacy pair would destroy
  // the only copy, so keep it and let a later mount retry once the slot clears.
  if (readCloudSessionValue(targetMetaKey) !== null) return false;

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
    : stageLegacyCloudSession({ payload, meta, workspaceId, ownerUserId });
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
