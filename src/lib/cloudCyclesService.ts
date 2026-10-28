import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { auth, db } from './firebase';
import { CloudCycleMetadata, CloudCycle, CloudOperationResult } from '../types/cloudCycles';
import { GFCForecastSaveData } from '../types/outlooks';
import type { ForecastWorkspacePayload } from '../utils/forecastWorkspaceEnvelope';
import { isWorkspaceSaveEnvelope } from '../utils/forecastWorkspaceEnvelope';
import type { CycleMetadata } from '../types/workflow';
import { boundWorkflowMetadataForPersistence, isValidWorkflowMetadata } from './workflowMetadataContract';
import { SavedCycleStats } from '../store/forecastSlice';
import { validateForecastData } from '../utils/fileUtils';
import { DEFAULT_FORECAST_WORKSPACE, resolveStoredWorkspaceId, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { fetchBetaApi, isBetaClerkD1Mode, isBetaSessionInitializing } from './betaApi';

const LEGACY_USER_SETTINGS_COLLECTION = 'userSettings';
const CLOUD_CYCLES_COLLECTION = 'cloudCycles';
const PAYLOAD_SUBCOLLECTION = 'payload';
const PAYLOAD_DOC_ID = 'payload';

/** Metadata-only Firestore document shape; the forecast payload lives in the `payload` subcollection. */
interface CloudCycleDocument extends CloudCycleMetadata {
  payloadBytes: number;
  /** v2 workflow metadata serialized as JSON in the Firestore document. */
  workflowMetadata?: CycleMetadata;
}

/** Firestore shape for the single payload document stored per cloud cycle. */
interface CloudCyclePayloadDocument {
  payloadJson: string;
  payloadBytes: number;
}

interface NormalizeMetadataParams {
  cycleId: string;
  rawMetadata: Record<string, unknown> | undefined;
  fallbackUserId: string;
}

interface NormalizeCloudCycleRecordParams {
  cycleId: string;
  rawRecord: unknown;
  fallbackUserId: string;
  /** Parsed payload from the subcollection; falls back to a legacy inline value when omitted. */
  payload?: ForecastWorkspacePayload;
}

interface NormalizeCloudCycleMetadataRecordParams {
  cycleId: string;
  rawRecord: unknown;
  fallbackUserId: string;
}

interface ReadCloudCyclesFromQueryParams {
  snapshot: { docs: Array<{ id: string; data: () => unknown }> };
  fallbackUserId: string;
}

interface UserCycleLookupParams {
  userId: string;
  cycleId: string;
}

interface ListCloudCyclesParams {
  userId: string;
}

interface RenameCloudCycleParams extends UserCycleLookupParams {
  newLabel: string;
}

interface CloudCycleSubscriptionParams {
  userId: string;
  onUpdate: (cycles: CloudCycleMetadata[]) => void;
  onError?: (error: Error) => void;
}

interface SaveCloudCycleParams {
  userId: string;
  label: string;
  cycleDate: string;
  stats: SavedCycleStats;
  payload: ForecastWorkspacePayload;
  workspaceId?: ForecastWorkspaceId;
  workflowMetadata?: CycleMetadata;
  isReadOnly?: boolean;
  existingId?: string;
}

const postCloudCycle = async (token: string, body: Record<string, unknown>) => {
  const response = isBetaClerkD1Mode() ? await fetchBetaApi('/api/cloud-cycles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) : await fetch('/api/cloud-cycles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { success: false, error: (await response.json().catch(() => ({}))).error || 'Unable to save cloud cycle' };
  return { success: true };
};

const buildCloudCycleRequest = ({ cycleId, params, metadata, workflowMetadata }: { cycleId: string; params: SaveCloudCycleParams; metadata: CloudCycleMetadata; workflowMetadata?: CycleMetadata }) => ({
  id: cycleId,
  userId: params.userId,
  label: params.label,
  cycleDate: params.cycleDate,
  payloadJson: JSON.stringify(params.payload),
  metadata: { ...metadata, ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}), ...(workflowMetadata ? { workflowMetadata } : {}) },
});

const getCloudSaveToken = async (): Promise<string | null> => {
  if (isBetaClerkD1Mode()) return 'clerk-session';
  const currentUser = auth?.currentUser;
  return currentUser ? currentUser.getIdToken() : null;
};

type LegacyCloudCyclesValue = string | Record<string, unknown> | undefined;

type LegacyUserSettingsDocument = {
  cloudCycles?: LegacyCloudCyclesValue;
};

/** Returns a stable no-op unsubscribe callback when the Firestore subscription cannot be created. */
function noopUnsubscribe(): void {
  return undefined;
}

/**
 * Computes a simple hash of the cycle payload for change detection
 * Uses a simple string hash rather than cryptographic hashing
 */
const computePayloadHash = (payload: ForecastWorkspacePayload): string => {
  const jsonStr = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Force the rolling hash back into a signed 32-bit integer.
  }
  return Math.abs(hash).toString(36).substring(0, 12);
};

/** Returns true when the value is a plain object record rather than an array or primitive. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Reads a stored cloud payload from either a JSON string or already-parsed object value. */
export const parseCloudCyclePayload = (value: unknown): ForecastWorkspacePayload | null => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isWorkspaceSaveEnvelope(parsed) && validateForecastData(parsed.forecast)) return parsed;
      return validateForecastData(parsed) ? (parsed as GFCForecastSaveData) : null;
    } catch {
      return null;
    }
  }

  if (isWorkspaceSaveEnvelope(value) && validateForecastData(value.forecast)) return value;
  if (validateForecastData(value)) {
    return value as GFCForecastSaveData;
  }

  return null;
};

/** Returns the shared Firestore collection reference for hosted cloud-cycle documents. */
const getCloudCyclesCollectionRef = () => {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }

  return collection(db, CLOUD_CYCLES_COLLECTION);
};

/** Returns the Firestore document reference for a specific cloud cycle. */
const getCloudCycleDocRef = (cycleId: string) => doc(getCloudCyclesCollectionRef(), cycleId);

/** Returns the Firestore document reference for a specific cloud cycle payload. */
const getCloudCyclePayloadDocRef = (cycleId: string) =>
  doc(collection(getCloudCyclesCollectionRef(), cycleId, PAYLOAD_SUBCOLLECTION), PAYLOAD_DOC_ID);

/** Reads the latest Firestore snapshot for one cloud cycle document. */
const getCloudCycleDocSnapshot = (cycleId: string) => getDoc(getCloudCycleDocRef(cycleId));

/** Returns the legacy user-settings document where pre-Phase 4 cloud cycles were stored. */
const getLegacyUserSettingsRef = (userId: string) => {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }

  return doc(db, LEGACY_USER_SETTINGS_COLLECTION, userId);
};

/** Reads a timestamp-like string while falling back to a safe ISO date when missing. */
const readTimestampString = (value: unknown, fallback = new Date(0).toISOString()): string =>
  typeof value === 'string' && value ? value : fallback;

/** Reads a required non-empty string from a stored metadata field. */
const readRequiredText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

/** Reads a stored number field, defaulting missing values to zero. */
const readStoredCount = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** Returns the serialized cloud payload plus its UTF-8 byte length for storage-safe writes. */
export const createCloudCyclePayloadStorage = (payload: ForecastWorkspacePayload): CloudCyclePayloadDocument => {
  const payloadJson = JSON.stringify(payload);
  return {
    payloadJson,
    payloadBytes: new TextEncoder().encode(payloadJson).length,
  };
};

/** Normalizes stored cloud-cycle metadata into the current metadata contract. */
const normalizeStoredMetadata = ({
  cycleId,
  rawMetadata,
  fallbackUserId,
}: NormalizeMetadataParams): CloudCycleMetadata | null => {
  if (!rawMetadata) {
    return null;
  }

  const label = readRequiredText(rawMetadata.label);
  const cycleDate = readRequiredText(rawMetadata.cycleDate);

  if (!label || !cycleDate) {
    return null;
  }

  // Missing metadata predates workspace ownership and belongs to Severe. An
  // explicit but unknown owner must stay hidden instead of being relabeled.
  const workspaceId = rawMetadata.workspaceId === undefined || rawMetadata.workspaceId === null
    ? DEFAULT_FORECAST_WORKSPACE
    : resolveStoredWorkspaceId(rawMetadata.workspaceId);
  if (!workspaceId) return null;

  return {
    id: readRequiredText(rawMetadata.id) ?? cycleId,
    userId: readRequiredText(rawMetadata.userId) ?? fallbackUserId,
    workspaceId,
    label,
    cycleDate,
    createdAt: readTimestampString(rawMetadata.createdAt),
    updatedAt: readTimestampString(rawMetadata.updatedAt, readTimestampString(rawMetadata.createdAt)),
    forecastDays: readStoredCount(rawMetadata.forecastDays),
    totalOutlooks: readStoredCount(rawMetadata.totalOutlooks),
    totalFeatures: readStoredCount(rawMetadata.totalFeatures),
    isReadOnly: Boolean(rawMetadata.isReadOnly),
    payloadHash: readRequiredText(rawMetadata.payloadHash) ?? undefined,
  };
};

/** Normalizes one raw Firestore or legacy cloud-cycle record into the app's runtime shape. */
const normalizeCloudCycleRecord = ({
  cycleId,
  rawRecord,
  fallbackUserId,
  payload: subcollectionPayload,
}: NormalizeCloudCycleRecordParams): CloudCycle | null => {
  if (!isPlainObject(rawRecord)) {
    return null;
  }

  const metadataSource = isPlainObject(rawRecord.metadata) ? (rawRecord.metadata as Record<string, unknown>) : rawRecord;
  const payload = subcollectionPayload ?? parseCloudCyclePayload(rawRecord.payloadJson ?? rawRecord.payload);

  const metadata = normalizeStoredMetadata({ cycleId, rawMetadata: metadataSource, fallbackUserId });
  if (!metadata || !payload) {
    return null;
  }

  // Keep the Firestore contract strict on the client too: invalid nested
  // metadata is ignored rather than trusted as workflow state.
  const rawWorkflowMetadata = rawRecord.workflowMetadata ?? metadataSource.workflowMetadata;
  const workflowMetadata = isValidWorkflowMetadata(rawWorkflowMetadata) &&
    rawWorkflowMetadata.cycleDate === metadata.cycleDate
    ? rawWorkflowMetadata
    : undefined;

  return {
    ...metadata,
    payload,
    ...(workflowMetadata ? { workflowMetadata } : {}),
  };
};

/** Normalizes one raw Firestore cloud-cycle document into list-safe metadata without parsing the payload. */
const normalizeCloudCycleMetadataRecord = ({
  cycleId,
  rawRecord,
  fallbackUserId,
}: NormalizeCloudCycleMetadataRecordParams): CloudCycleMetadata | null => {
  if (!isPlainObject(rawRecord)) {
    return null;
  }

  const metadataSource = isPlainObject(rawRecord.metadata) ? (rawRecord.metadata as Record<string, unknown>) : rawRecord;
  return normalizeStoredMetadata({ cycleId, rawMetadata: metadataSource, fallbackUserId });
};

/** Keeps workflow metadata only when it belongs to the same cycle date. */
const getCompatibleWorkflowMetadata = (workflowMetadata: unknown, cycleDate: string): CycleMetadata | undefined => {
  if (!isPlainObject(workflowMetadata)) return undefined;
  if (workflowMetadata.cycleDate !== cycleDate) return undefined;
  if (!isValidWorkflowMetadata(workflowMetadata)) return undefined;

  const bounded = boundWorkflowMetadataForPersistence(workflowMetadata);
  return isValidWorkflowMetadata(bounded) ? bounded : undefined;
};

/** Serializes a runtime cloud cycle back into the metadata-only Firestore storage format. */
const serializeCloudCycleDocument = (cycle: CloudCycle): CloudCycleDocument => {
  const { payload, workflowMetadata, ...metadata } = cycle;
  const validWorkflowMetadata = getCompatibleWorkflowMetadata(workflowMetadata, metadata.cycleDate);

  return {
    ...metadata,
    payloadBytes: createCloudCyclePayloadStorage(payload).payloadBytes,
    ...(validWorkflowMetadata ? { workflowMetadata: validWorkflowMetadata } : {}),
  };
};

/** Strips the saved payload from a cloud cycle so library APIs can expose metadata-only objects. */
const toCloudCycleMetadata = ({ payload: _payload, workflowMetadata: _wm, ...cycleMetadata }: CloudCycle): CloudCycleMetadata => cycleMetadata;

/** Sorts cloud-cycle metadata from newest to oldest update time. */
const sortCloudCycleMetadata = (cycles: CloudCycleMetadata[]): CloudCycleMetadata[] =>
  [...cycles].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

/** Creates a collision-resistant id for new hosted cloud cycles. */
const createCloudCycleId = (userId: string, cycleDate: string): string =>
  `${userId}-${cycleDate}-${uuidv4()}`;

/** Converts a Firestore query snapshot into normalized cloud-cycle records, including payload validation. */
const readCloudCyclesFromQuery = ({ snapshot, fallbackUserId }: ReadCloudCyclesFromQueryParams): CloudCycle[] =>
  snapshot.docs
    .map((cycleDoc) => normalizeCloudCycleRecord({ cycleId: cycleDoc.id, rawRecord: cycleDoc.data(), fallbackUserId }))
    .filter((cycle): cycle is CloudCycle => Boolean(cycle));

/** Converts a Firestore query snapshot into normalized cloud-cycle metadata without parsing payload JSON. */
const readCloudCycleMetadataFromQuery = ({ snapshot, fallbackUserId }: ReadCloudCyclesFromQueryParams): CloudCycleMetadata[] =>
  snapshot.docs
    .map((cycleDoc) =>
      normalizeCloudCycleMetadataRecord({ cycleId: cycleDoc.id, rawRecord: cycleDoc.data(), fallbackUserId })
    )
    .filter((cycle): cycle is CloudCycleMetadata => Boolean(cycle));

/** Reads older cloud-cycle data from the legacy user-settings document if present. */
const readLegacyCloudCycles = async (userId: string): Promise<CloudCycle[]> => {
  try {
    const snapshot = await getDoc(getLegacyUserSettingsRef(userId));
    const legacyData = snapshot.data() as LegacyUserSettingsDocument | undefined;
    const rawValue = legacyData?.cloudCycles;

    if (!rawValue) {
      return [];
    }

    const rawStore = typeof rawValue === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(rawValue) as unknown;
            return isPlainObject(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : isPlainObject(rawValue)
        ? rawValue
        : null;

    if (!rawStore) {
      return [];
    }

    return Object.entries(rawStore)
      .map(([cycleId, rawRecord]) => normalizeCloudCycleRecord({ cycleId, rawRecord, fallbackUserId: userId }))
      .filter((cycle): cycle is CloudCycle => Boolean(cycle));
  } catch (error) {
    console.error('Error reading legacy cloud cycles:', error);
    return [];
  }
};

/** Reads all cloud cycles for a user, retaining legacy records without mutating them. */
const readCloudCyclesForUser = async (userId: string): Promise<CloudCycle[]> => {
  const snapshot = await getDocs(query(getCloudCyclesCollectionRef(), where('userId', '==', userId)));
  const cycles = readCloudCyclesFromQuery({ snapshot, fallbackUserId: userId });

  if (cycles.length > 0) {
    return cycles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }

  const legacyCycles = await readLegacyCloudCycles(userId);
  return legacyCycles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
};

/** Reads one cloud-cycle payload from the subcollection, or null when absent or invalid. */
const readCloudCyclePayload = async (cycleId: string): Promise<ForecastWorkspacePayload | null> => {
  const payloadSnapshot = await getDoc(getCloudCyclePayloadDocRef(cycleId));
  if (!payloadSnapshot.exists()) {
    return null;
  }

  return parseCloudCyclePayload(payloadSnapshot.data().payloadJson);
};

/** Fetches one cloud cycle by id, including legacy fallback and migration support. */
const fetchCloudCycleById = async ({ userId, cycleId }: UserCycleLookupParams): Promise<CloudCycle | null> => {
  const docSnapshot = await getCloudCycleDocSnapshot(cycleId);
  if (docSnapshot.exists()) {
    const payload = await readCloudCyclePayload(cycleId);
    const cycle = normalizeCloudCycleRecord({
      cycleId: docSnapshot.id,
      rawRecord: docSnapshot.data(),
      fallbackUserId: userId,
      payload: payload ?? undefined,
    });
    if (cycle && cycle.userId === userId) {
      return cycle;
    }
  }

  const legacyCycles = await readLegacyCloudCycles(userId);
  const legacyMatch = legacyCycles.find((cycle) => cycle.id === cycleId) ?? null;
  return legacyMatch;
};

/** Returns an existing cloud cycle only when it belongs to the current signed-in user. */
const getOwnedCloudCycle = async ({ userId, cycleId }: UserCycleLookupParams): Promise<CloudCycle | null> => {
  const existingSnapshot = await getCloudCycleDocSnapshot(cycleId);
  if (!existingSnapshot.exists()) {
    return null;
  }

  const payload = await readCloudCyclePayload(cycleId);
  const existingCycle = normalizeCloudCycleRecord({
    cycleId,
    rawRecord: existingSnapshot.data(),
    fallbackUserId: userId,
    payload: payload ?? undefined,
  });
  if (!existingCycle || existingCycle.userId !== userId) {
    return null;
  }

  return existingCycle;
};

/**
 * Saves a new cloud cycle or updates an existing one
 */
const buildCloudCycleSaveContext = async (params: SaveCloudCycleParams) => {
  const cycleId = params.existingId || createCloudCycleId(params.userId, params.cycleDate);
  if (isBetaClerkD1Mode()) return buildBetaCloudCycleSaveContext(params, cycleId);
  return buildFirestoreCloudCycleSaveContext(params, cycleId);
};

const buildBetaCloudCycleSaveContext = async (params: SaveCloudCycleParams, cycleId: string) => {
  const existingMetadata = await readBetaCloudCycleMetadata(params);
  if (existingMetadata && 'error' in existingMetadata) return existingMetadata;
  const now = new Date().toISOString();
  const metadata: CloudCycleMetadata = {
    id: cycleId, userId: params.userId, label: params.label, cycleDate: params.cycleDate,
    createdAt: readTimestampString(existingMetadata?.createdAt, now), updatedAt: now, forecastDays: params.stats.forecastDays,
    totalOutlooks: params.stats.totalOutlooks, totalFeatures: params.stats.totalFeatures,
    isReadOnly: params.isReadOnly ?? false, payloadHash: computePayloadHash(params.payload),
    workspaceId: params.workspaceId ?? DEFAULT_FORECAST_WORKSPACE,
  };
  return { cycleId, metadata, workflowMetadata: getCompatibleWorkflowMetadata(params.workflowMetadata, params.cycleDate) };
};

type ExistingBetaCycleMetadata = { createdAt: unknown };

const readBetaCloudCycleMetadata = async (params: SaveCloudCycleParams): Promise<ExistingBetaCycleMetadata | { error: string } | null> => {
  if (!params.existingId) return null;
  const response = await fetchBetaApi(`/api/cloud-cycles/${encodeURIComponent(params.existingId)}`);
  const body = (await response.json().catch(() => ({}))) ?? {};
  if (!response.ok) return { error: typeof body?.error === 'string' ? body.error : 'Unable to save cloud cycle' };
  return readOwnedBetaCycleMetadata(body.cycle, params.userId);
};

const readOwnedBetaCycleMetadata = (cycle: unknown, userId: string): ExistingBetaCycleMetadata | { error: 'Cloud cycle not found' } => {
  if (!isPlainObject(cycle)) return { error: 'Cloud cycle not found' as const };
  const metadata = isPlainObject(cycle.metadata) ? cycle.metadata : cycle;
  if ((cycle.userId ?? metadata.userId) !== userId) return { error: 'Cloud cycle not found' as const };
  return { createdAt: metadata.createdAt };
};

const buildFirestoreCloudCycleSaveContext = async (params: SaveCloudCycleParams, cycleId: string) => {
  const existingCycle = params.existingId ? await getOwnedCloudCycle({ userId: params.userId, cycleId: params.existingId }) : null;
  if (params.existingId && !existingCycle) return { error: 'Cloud cycle not found' as const };
  const now = new Date().toISOString();
  const metadata: CloudCycleMetadata = {
    id: cycleId, userId: params.userId, label: params.label, cycleDate: params.cycleDate,
    createdAt: existingCycle?.createdAt ?? now, updatedAt: now,
    forecastDays: params.stats.forecastDays, totalOutlooks: params.stats.totalOutlooks,
    totalFeatures: params.stats.totalFeatures, isReadOnly: params.isReadOnly ?? false,
    payloadHash: computePayloadHash(params.payload),
    workspaceId: params.workspaceId ?? DEFAULT_FORECAST_WORKSPACE,
  };
  return { cycleId, metadata, workflowMetadata: getCompatibleWorkflowMetadata(params.workflowMetadata, params.cycleDate) };
};

const saveCloudCycleInternal = async (params: SaveCloudCycleParams): Promise<CloudOperationResult<string>> => {
  try {
    const context = await buildCloudCycleSaveContext(params);
    if ('error' in context) return { success: false, error: context.error };
    const token = await getCloudSaveToken();
    if (!token) return { success: false, error: 'Authentication required' };
    const result = await postCloudCycle(token, buildCloudCycleRequest({ cycleId: context.cycleId, params, metadata: context.metadata, workflowMetadata: context.workflowMetadata }));
    if (!result.success) return result;
    return { success: true, data: context.cycleId };
  } catch (error) {
    console.error('Error saving cloud cycle:', error);
    return {
      success: false,
      error: `Failed to save cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

export const saveCloudCycle = (params: SaveCloudCycleParams): Promise<CloudOperationResult<string>> =>
  saveCloudCycleInternal(params);

/** Loads a specific cloud cycle for the requested user. */
export const loadCloudCycle = async (
  params: UserCycleLookupParams
): Promise<CloudOperationResult<CloudCycle>> => {
  try {
    if (isBetaClerkD1Mode()) return await loadBetaCloudCycle(params);
    const record = await fetchCloudCycleById(params);

    if (!record) {
      return {
        success: false,
        error: 'Cloud cycle not found',
      };
    }

    return {
      success: true,
      data: record,
    };
  } catch (error) {
    console.error('Error loading cloud cycle:', error);
    return {
      success: false,
      error: `Failed to load cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

const loadBetaCloudCycle = async (params: UserCycleLookupParams): Promise<CloudOperationResult<CloudCycle>> => {
  const response = await fetchBetaApi(`/api/cloud-cycles/${encodeURIComponent(params.cycleId)}`);
  const body = await response.json().catch(() => ({}));
  const ownedCycle = readOwnedBetaCycleMetadata(body?.cycle, params.userId);
  if (!response.ok || 'error' in ownedCycle) return { success: false, error: body?.error || 'Cloud cycle not found' };
  const validatedPayload = parseCloudCyclePayload(body.cycle.payload);
  const cycle = normalizeCloudCycleRecord({ cycleId: params.cycleId, rawRecord: body.cycle, fallbackUserId: params.userId, payload: validatedPayload ?? undefined });
  return cycle ? { success: true, data: cycle } : { success: false, error: 'Cloud cycle data is invalid.' };
};

/** Deletes a cloud cycle only when it belongs to the requested user. */
export const deleteCloudCycle = async (
  params: UserCycleLookupParams
): Promise<CloudOperationResult> => {
  try {
    if (isBetaClerkD1Mode()) return await deleteBetaCloudCycle(params);
    const existingCycle = await getOwnedCloudCycle(params);
    if (!existingCycle) {
      return { success: true };
    }

    await deleteDoc(getCloudCyclePayloadDocRef(params.cycleId));
    await deleteDoc(getCloudCycleDocRef(params.cycleId));

    return { success: true };
  } catch (error) {
    console.error('Error deleting cloud cycle:', error);
    return {
      success: false,
      error: `Failed to delete cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

const deleteBetaCloudCycle = async (params: UserCycleLookupParams): Promise<CloudOperationResult> => {
  const response = await fetchBetaApi(`/api/cloud-cycles/${encodeURIComponent(params.cycleId)}`, { method: 'DELETE' });
  if (response.ok || response.status === 404) return { success: true };
  const body = await response.json().catch(() => ({}));
  return { success: false, error: body?.error || 'Unable to delete cloud cycle.' };
};

/** Renames a cloud cycle only when it belongs to the requested user. */
export const renameCloudCycle = async (
  params: RenameCloudCycleParams
): Promise<CloudOperationResult> => {
  try {
    if (isBetaClerkD1Mode()) {
      const response = await fetchBetaApi(`/api/cloud-cycles/${encodeURIComponent(params.cycleId)}`, {
        method: 'PATCH', body: JSON.stringify({ label: params.newLabel }),
      });
      if (response.ok) return { success: true };
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body?.error || 'Cloud cycle not found' };
    }
    const existing = await getOwnedCloudCycle(params);
    if (!existing) {
      return {
        success: false,
        error: 'Cloud cycle not found',
      };
    }

    const nextMetadata: CloudCycle = {
      ...existing,
      label: params.newLabel,
      updatedAt: new Date().toISOString(),
      payloadHash: computePayloadHash(existing.payload),
    };

    await setDoc(getCloudCycleDocRef(params.cycleId), serializeCloudCycleDocument(nextMetadata));

    return { success: true };
  } catch (error) {
    console.error('Error renaming cloud cycle:', error);
    return {
      success: false,
      error: `Failed to rename cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Lists all cloud cycles for a user as metadata-only objects.
 * Payload JSON lives in a dedicated subcollection, so this query transfers
 * metadata only. Legacy documents are handled through the migration fallback.
 */
export async function listCloudCycles(
  { userId }: ListCloudCyclesParams
): Promise<CloudOperationResult<CloudCycleMetadata[]>> {
  try {
    if (isBetaClerkD1Mode()) {
      const result = await listBetaCloudCyclePages(userId);
      return result.success && result.data ? { success: true, data: sortCloudCycleMetadata(result.data) } : result;
    }
    const snapshot = await getDocs(query(getCloudCyclesCollectionRef(), where('userId', '==', userId)));
    const metadata = readCloudCycleMetadataFromQuery({ snapshot, fallbackUserId: userId });
    const legacyCycles = await readLegacyCloudCycles(userId);
    const visibleMetadata = [
      ...metadata,
      ...legacyCycles.map(toCloudCycleMetadata),
    ].filter((cycle, index, cycles) => cycles.findIndex((candidate) => candidate.id === cycle.id) === index);

    if (visibleMetadata.length > 0) {
      // Read-time migration is intentionally absent: retain legacy records in the list even after hosted records exist.
      return { success: true, data: sortCloudCycleMetadata(visibleMetadata) };
    }

    const cycles = await readCloudCyclesForUser(userId);

    return { success: true, data: sortCloudCycleMetadata(cycles.map(toCloudCycleMetadata)) };
  } catch (error) {
    console.error('Error listing cloud cycles:', error);
    return {
      success: false,
      error: `Failed to list cloud cycles: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

type BetaCloudCyclePage = { cycles: CloudCycleMetadata[]; nextPage: number | null };
type BetaCloudCyclePageResult = { success: true; data: BetaCloudCyclePage } | { success: false; error: string };

const listBetaCloudCyclePages = async (userId: string): Promise<CloudOperationResult<CloudCycleMetadata[]>> => {
  const cycles: CloudCycleMetadata[] = [];
  let page = 0;
  while (true) {
    const result = await fetchBetaCloudCyclePage(userId, page);
    if (!result.success) return result;
    cycles.push(...result.data.cycles);
    if (result.data.nextPage === null) return { success: true, data: cycles };
    page = result.data.nextPage;
  }
};

const fetchBetaCloudCyclePage = async (userId: string, page: number): Promise<BetaCloudCyclePageResult> => {
  const response = await fetchBetaApi(`/api/cloud-cycles?page=${page}`);
  const body = (await response.json().catch(() => ({}))) ?? {};
  if (!response.ok) return { success: false, error: body.error || 'Unable to list cloud cycles' };
  const cycles = Array.isArray(body?.cycles) ? body.cycles.map((raw: unknown) => normalizeBetaCloudCycle(raw, userId)).filter(isOwnedCycle(userId)) : [];
  return { success: true, data: { cycles, nextPage: readNextCyclePage(body?.nextPage) } };
};

const hasBetaCloudCycleId = (record: Record<string, unknown>): boolean => {
  if (typeof record.id !== 'string') return false;
  return Boolean(record.id);
};

const betaCloudCycleOwnerId = (record: Record<string, unknown>): unknown => {
  if (record.userId !== null && record.userId !== undefined) return record.userId;
  if (!isPlainObject(record.metadata)) return undefined;
  return record.metadata.userId;
};

const normalizeBetaCloudCycle = (raw: unknown, userId: string): CloudCycleMetadata | null => {
  if (!isPlainObject(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!hasBetaCloudCycleId(record)) return null;
  if (betaCloudCycleOwnerId(record) !== userId) return null;
  return normalizeCloudCycleMetadataRecord({ cycleId: record.id as string, rawRecord: record, fallbackUserId: userId });
};

const isOwnedCycle = (userId: string) => (cycle: CloudCycleMetadata | null): cycle is CloudCycleMetadata => Boolean(cycle?.id && cycle.userId === userId);
const readNextCyclePage = (nextPage: unknown): number | null => Number.isSafeInteger(nextPage) ? nextPage as number : null;

const refreshBetaCloudCycles = async (
  params: CloudCycleSubscriptionParams,
  isActive: () => boolean,
  scheduleRetry: () => void
) => {
  try {
    const result = await listCloudCycles({ userId: params.userId });
    applyCloudCycleRefreshResult(result, params, isActive, scheduleRetry);
  } catch (error) {
    reportCloudCycleRefreshError(error, params.onError, isActive, scheduleRetry);
  }
};

const applyCloudCycleRefreshResult = (
  result: CloudOperationResult<CloudCycleMetadata[]>,
  params: CloudCycleSubscriptionParams,
  isActive: () => boolean,
  scheduleRetry: () => void
) => {
  if (!isActive()) return;
  if (result.success && result.data) {
    params.onUpdate(result.data);
    return;
  }
  if (!result.success) applyCloudCycleRefreshFailure(result.error, params.onError, scheduleRetry);
};

const applyCloudCycleRefreshFailure = (
  message: string | undefined,
  onError: CloudCycleSubscriptionParams['onError'],
  scheduleRetry: () => void,
) => {
  if (isBetaSessionInitializing(message)) {
    scheduleRetry();
    return;
  }
  onError?.(new Error(message || 'Unable to refresh cloud cycles.'));
};

const reportCloudCycleRefreshError = (
  error: unknown,
  onError: CloudCycleSubscriptionParams['onError'],
  isActive: () => boolean,
  scheduleRetry: () => void
) => {
  if (!isActive()) return;
  if (isBetaSessionInitializing(error)) scheduleRetry();
  else onError?.(error instanceof Error ? error : new Error('Unable to refresh cloud cycles.'));
};

/**
 * Subscribes to cloud cycles list for real-time updates
 */
export const subscribeToCloudCycles = (
  { userId, onUpdate, onError }: CloudCycleSubscriptionParams
): (() => void) => {
  if (isBetaClerkD1Mode()) {
    let active = true;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const scheduleRetry = () => {
      if (!active || retryTimer !== undefined) return;
      retryTimer = globalThis.setTimeout(() => { retryTimer = undefined; void refresh(); }, 250);
    };
    const refresh = () => refreshBetaCloudCycles({ userId, onUpdate, onError }, () => active, scheduleRetry);
    refresh().catch(() => undefined);
    const timer = globalThis.setInterval(() => refresh().catch(() => undefined), 15_000);
    return () => { active = false; globalThis.clearInterval(timer); if (retryTimer !== undefined) globalThis.clearTimeout(retryTimer); };
  }
  let active = true;
  try {
    const cyclesQuery = query(getCloudCyclesCollectionRef(), where('userId', '==', userId));
    const unsubscribe = onSnapshot(
      cyclesQuery,
      (querySnapshot) => {
        const metadata = readCloudCycleMetadataFromQuery({ snapshot: querySnapshot, fallbackUserId: userId });
        if (metadata.length > 0) {
          onUpdate(sortCloudCycleMetadata(metadata));
          return;
        }

        void readLegacyCloudCycles(userId)
          .then(async (legacyCycles) => {
            if (!active) {
              return;
            }
            if (active) {
              onUpdate(sortCloudCycleMetadata(legacyCycles.map(toCloudCycleMetadata)));
            }
          })
          .catch((error: unknown) => {
            if (active) {
              onError?.(error instanceof Error ? error : new Error('Unable to load legacy cloud cycles.'));
            }
          });
      },
      (error) => {
        console.error('Error subscribing to cloud cycles:', error);
        onError?.(error as Error);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  } catch (error) {
    console.error('Error setting up cloud cycles subscription:', error);
    if (onError && error instanceof Error) onError(error);
    return noopUnsubscribe;
  }
};
