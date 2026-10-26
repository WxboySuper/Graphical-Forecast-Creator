import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { classifyForecastWorkspacePayload } from './forecastWorkspacePersistence';
import { getScopedStorageKey, getStorageScope } from './storageScope';

export const CLOUD_CYCLE_PAYLOAD_KEY = 'cloudCyclePayload';
export const CLOUD_CYCLE_META_KEY = 'cloudCycleMeta';
type CloudSessionStorageSlot = typeof CLOUD_CYCLE_PAYLOAD_KEY | typeof CLOUD_CYCLE_META_KEY;

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
export const getCloudSessionStorageKey = ({
  baseKey,
  scope: { userId, workspaceId },
}: {
  baseKey: CloudSessionStorageSlot;
  scope: CloudSessionScope;
}): string => getScopedStorageKey(`${baseKey}:${workspaceId}`, getStorageScope(userId));

/** Drops one stored value, ignoring unavailable browser storage. */
export const removeCloudSessionStorageValue = ({ key }: { key: string }): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return; // storage is unavailable; the stale copy is harmless
  }
};

/** Reads one session value, treating unavailable browser storage as empty. */
const readCloudSessionValue = ({ key }: { key: string }): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Writes one session value, treating unavailable browser storage as a no-op. */
const writeCloudSessionValue = ({ key, value }: { key: string; value: string }): void => {
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
const listLegacyCloudSessionPairs = (
  { userId }: Pick<CloudSessionScope, 'userId'> = {},
): LegacyCloudSessionPair[] => {
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
const resolveLegacyHandoffWorkspace = ({ payload }: {
  payload: string;
}): ForecastWorkspaceId | null => {
  try {
    const value = JSON.parse(payload) as unknown;
    const classification = classifyForecastWorkspacePayload(value);
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
const ownsLegacyCloudSessionPair = ({ payloadKey, workspaceId }: {
  payloadKey: string;
  workspaceId: ForecastWorkspaceId;
}): boolean => {
  const payload = readCloudSessionValue({ key: payloadKey });
  if (payload === null) return false;
  const owner = resolveLegacyHandoffWorkspace({ payload });
  return owner !== null && owner === workspaceId;
};

/**
 * Removes the handoff copies owned by one workspace, plus the unscoped
 * pre-workspace pair when its payload belongs to that same workspace. Every
 * other workspace's staged handoff and any unattributable legacy value stays in
 * place.
 */
export const clearCloudSessionStorage = ({ userId, workspaceId }: CloudSessionScope): void => {
  const baseKeys: CloudSessionStorageSlot[] = [CLOUD_CYCLE_PAYLOAD_KEY, CLOUD_CYCLE_META_KEY];
  for (const baseKey of baseKeys) {
    removeCloudSessionStorageValue({ key: getCloudSessionStorageKey({ baseKey, scope: { userId, workspaceId } }) });
    if (userId) {
      removeCloudSessionStorageValue({ key: getCloudSessionStorageKey({ baseKey, scope: { workspaceId } }) });
    }
  }
  for (const { payloadKey, metaKey } of listLegacyCloudSessionPairs({ userId })) {
    if (!ownsLegacyCloudSessionPair({ payloadKey, workspaceId })) continue;
    removeCloudSessionStorageValue({ key: payloadKey });
    removeCloudSessionStorageValue({ key: metaKey });
  }
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
const hasSupersedingCloudHandoff = ({ payloadKey, metaKey, legacyMeta }: {
  payloadKey: string;
  metaKey: string;
  legacyMeta: string | null;
}): boolean => {
  if (readCloudSessionValue({ key: payloadKey }) === null) return false;
  if (legacyMeta === null) return true;
  return readCloudSessionValue({ key: metaKey }) !== null;
};

interface CloudHandoffTargetKeys {
  payload: string;
  meta: string;
}

interface CloudHandoffValues {
  payload: string;
  meta: string | null;
}

interface CloudHandoffWriteState {
  payloadWritten: boolean;
  metaWritten: boolean;
}

const readCloudHandoffWriteState = ({
  keys,
  values,
}: {
  keys: CloudHandoffTargetKeys;
  values: CloudHandoffValues;
}): CloudHandoffWriteState => {
  const payloadWritten = readCloudSessionValue({ key: keys.payload }) === values.payload;
  if (values.meta === null) return { payloadWritten, metaWritten: true };
  return {
    payloadWritten,
    metaWritten: readCloudSessionValue({ key: keys.meta }) === values.meta,
  };
};

const rollbackPartialCloudHandoff = ({ keys, values, state }: {
  keys: CloudHandoffTargetKeys;
  values: CloudHandoffValues;
  state: CloudHandoffWriteState;
}): void => {
  if (!state.payloadWritten) {
    if (!state.metaWritten) return;
    if (values.meta === null) return;
    removeCloudSessionStorageValue({ key: keys.meta });
    return;
  }
  if (!state.metaWritten) removeCloudSessionStorageValue({ key: keys.payload });
};

const writeLegacyCloudHandoff = ({ keys, values }: {
  keys: CloudHandoffTargetKeys;
  values: CloudHandoffValues;
}): boolean => {
  writeCloudSessionValue({ key: keys.payload, value: values.payload });
  if (values.meta !== null) writeCloudSessionValue({ key: keys.meta, value: values.meta });

  const state = readCloudHandoffWriteState({ keys, values });
  rollbackPartialCloudHandoff({ keys, values, state });
  return state.payloadWritten && state.metaWritten;
};

const stageLegacyCloudSession = ({ payload, meta, workspaceId, ownerUserId }: LegacyCloudHandoff): boolean => {
  const scope = { userId: ownerUserId, workspaceId };
  const keys = {
    payload: getCloudSessionStorageKey({ baseKey: CLOUD_CYCLE_PAYLOAD_KEY, scope }),
    meta: getCloudSessionStorageKey({ baseKey: CLOUD_CYCLE_META_KEY, scope }),
  };

  // A payload already staged under the new keys is newer, so it wins. Keep a
  // legacy pair when its metadata has nowhere safe to go.
  if (hasSupersedingCloudHandoff({ payloadKey: keys.payload, metaKey: keys.meta, legacyMeta: meta })) return true;

  // Never overwrite either half of an existing target handoff. A partial
  // target keeps the legacy pair available for a later recovery attempt.
  if (
    readCloudSessionValue({ key: keys.payload }) !== null
    || readCloudSessionValue({ key: keys.meta }) !== null
  ) return false;

  // Leave the legacy pair available when either part of the target write fails.
  return writeLegacyCloudHandoff({ keys, values: { payload, meta } });
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
  const payload = readCloudSessionValue({ key: payloadKey });
  const meta = readCloudSessionValue({ key: metaKey });
  if (payload === null && meta === null) return;

  const workspaceId = payload === null ? null : resolveLegacyHandoffWorkspace({ payload });
  const migrated = payload === null || workspaceId === null
    ? true
    : stageLegacyCloudSession({ payload, meta, workspaceId, ownerUserId });
  if (!migrated) return;

  removeCloudSessionStorageValue({ key: payloadKey });
  removeCloudSessionStorageValue({ key: metaKey });
};

/**
 * Moves the pre-workspace `cloudCyclePayload` / `cloudCycleMeta` keys into the
 * workspace-scoped slots before a restore reads them. Untagged historical
 * payloads default to Severe; only a workspace envelope can route them elsewhere.
 *
 * Those keys carried no workspace, and the oldest of them carried no account
 * either. A key that already names the mounting account moves into that
 * account's slot, which is how a pending load survives the sign-in transition.
 * The anonymous and unscoped keys move into the anonymous slot: those were only
 * ever read signed out, and nothing in them says which account staged them, so
 * no account scope ever receives them.
 */
export const migrateLegacyCloudSessionStorage = (
  scope: Pick<CloudSessionScope, 'userId'> & Partial<Pick<CloudSessionScope, 'workspaceId'>> = {},
): void => {
  for (const pair of listLegacyCloudSessionPairs(scope)) {
    migrateLegacyCloudSessionPair(pair);
  }
};
