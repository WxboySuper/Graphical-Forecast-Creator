import { collection, deleteField, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { CloudCycleMetadata, CloudCycle, CloudOperationResult } from '../types/cloudCycles';
import { GFCForecastSaveData } from '../types/outlooks';
import { SavedCycleStats } from '../store/forecastSlice';
import { validateForecastData } from '../utils/fileUtils';

const LEGACY_USER_SETTINGS_COLLECTION = 'userSettings';
const CLOUD_CYCLES_COLLECTION = 'cloudCycles';

interface CloudCycleDocument extends CloudCycleMetadata {
  payloadJson: string;
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
}

interface ReadCloudCyclesFromQueryParams {
  snapshot: { docs: Array<{ id: string; data: () => unknown }> };
  fallbackUserId: string;
}

interface UserCycleLookupParams {
  userId: string;
  cycleId: string;
}

interface SaveCloudCycleParams {
  userId: string;
  label: string;
  cycleDate: string;
  stats: SavedCycleStats;
  payload: GFCForecastSaveData;
  isReadOnly?: boolean;
  existingId?: string;
}

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
const computePayloadHash = (payload: GFCForecastSaveData): string => {
  const jsonStr = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 12);
};

/** Returns true when the value is a plain object record rather than an array or primitive. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Reads a stored cloud payload from either a JSON string or already-parsed object value. */
const parseStoredPayload = (value: unknown): GFCForecastSaveData | null => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return validateForecastData(parsed) ? (parsed as GFCForecastSaveData) : null;
    } catch {
      return null;
    }
  }

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

  return {
    id: readRequiredText(rawMetadata.id) ?? cycleId,
    userId: readRequiredText(rawMetadata.userId) ?? fallbackUserId,
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
}: NormalizeCloudCycleRecordParams): CloudCycle | null => {
  if (!isPlainObject(rawRecord)) {
    return null;
  }

  const metadataSource = isPlainObject(rawRecord.metadata) ? (rawRecord.metadata as Record<string, unknown>) : rawRecord;
  const payload = parseStoredPayload(rawRecord.payloadJson ?? rawRecord.payload);

  const metadata = normalizeStoredMetadata({ cycleId, rawMetadata: metadataSource, fallbackUserId });
  if (!metadata || !payload) {
    return null;
  }

  return {
    ...metadata,
    payload,
  };
};

/** Serializes a runtime cloud cycle back into the Firestore storage format. */
const serializeCloudCycleDocument = (cycle: CloudCycle): CloudCycleDocument => {
  const { payload, ...metadata } = cycle;

  return {
    ...metadata,
    payloadJson: JSON.stringify(payload),
  };
};

/** Strips the saved payload from a cloud cycle so list views can work with metadata only. */
const toCloudCycleMetadata = ({ payload: _payload, ...cycleMetadata }: CloudCycle): CloudCycleMetadata => cycleMetadata;

/** Converts a Firestore query snapshot into normalized cloud-cycle records. */
const readCloudCyclesFromQuery = ({ snapshot, fallbackUserId }: ReadCloudCyclesFromQueryParams): CloudCycle[] =>
  snapshot.docs
    .map((cycleDoc) => normalizeCloudCycleRecord({ cycleId: cycleDoc.id, rawRecord: cycleDoc.data(), fallbackUserId }))
    .filter((cycle): cycle is CloudCycle => Boolean(cycle));

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

/** Migrates legacy cloud cycles into the dedicated `cloudCycles` collection and clears the old field. */
const migrateLegacyCloudCycles = async (userId: string, cycles: CloudCycle[]): Promise<void> => {
  if (!cycles.length) {
    return;
  }

  await Promise.all(
    cycles.map(async (cycle) => {
      await setDoc(getCloudCycleDocRef(cycle.id), serializeCloudCycleDocument(cycle));
    })
  );

  await setDoc(
    getLegacyUserSettingsRef(userId),
    {
      cloudCycles: deleteField(),
    },
    { merge: true }
  );
};

/** Reads all cloud cycles for a user, transparently migrating legacy records when needed. */
const readCloudCyclesForUser = async (userId: string): Promise<CloudCycle[]> => {
  const snapshot = await getDocs(query(getCloudCyclesCollectionRef(), where('userId', '==', userId)));
  const cycles = readCloudCyclesFromQuery({ snapshot, fallbackUserId: userId });

  if (cycles.length > 0) {
    return cycles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }

  const legacyCycles = await readLegacyCloudCycles(userId);
  if (legacyCycles.length > 0) {
    await migrateLegacyCloudCycles(userId, legacyCycles);
  }

  return legacyCycles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
};

/** Fetches one cloud cycle by id, including legacy fallback and migration support. */
const fetchCloudCycleById = async ({ userId, cycleId }: UserCycleLookupParams): Promise<CloudCycle | null> => {
  const docSnapshot = await getCloudCycleDocSnapshot(cycleId);
  if (docSnapshot.exists()) {
    const cycle = normalizeCloudCycleRecord({ cycleId: docSnapshot.id, rawRecord: docSnapshot.data(), fallbackUserId: userId });
    if (cycle && cycle.userId === userId) {
      return cycle;
    }
  }

  const legacyCycles = await readLegacyCloudCycles(userId);
  const legacyMatch = legacyCycles.find((cycle) => cycle.id === cycleId) ?? null;
  if (legacyMatch) {
    await migrateLegacyCloudCycles(userId, legacyCycles);
  }

  return legacyMatch;
};

/** Returns an existing cloud cycle only when it belongs to the current signed-in user. */
const getOwnedCloudCycle = async ({ userId, cycleId }: UserCycleLookupParams): Promise<CloudCycle | null> => {
  const existingSnapshot = await getCloudCycleDocSnapshot(cycleId);
  if (!existingSnapshot.exists()) {
    return null;
  }

  const existingCycle = normalizeCloudCycleRecord({ cycleId, rawRecord: existingSnapshot.data(), fallbackUserId: userId });
  if (!existingCycle || existingCycle.userId !== userId) {
    return null;
  }

  return existingCycle;
};

/**
 * Saves a new cloud cycle or updates an existing one
 */
export const saveCloudCycle = async (
  params: SaveCloudCycleParams
): Promise<CloudOperationResult<string>> => {
  try {
    const { userId, label, cycleDate, stats, payload, isReadOnly = false, existingId } = params;
    const cycleId = existingId || `${cycleDate}-${Date.now()}`;
    const now = new Date().toISOString();
    const existingCycle = existingId ? await getOwnedCloudCycle({ userId, cycleId: existingId }) : null;

    if (existingId && !existingCycle) {
      return {
        success: false,
        error: 'Cloud cycle not found',
      };
    }

    const metadata: CloudCycleMetadata = {
      id: cycleId,
      userId,
      label,
      cycleDate,
      createdAt: existingCycle?.createdAt ?? now,
      updatedAt: now,
      forecastDays: stats.forecastDays,
      totalOutlooks: stats.totalOutlooks,
      totalFeatures: stats.totalFeatures,
      isReadOnly,
      payloadHash: computePayloadHash(payload),
    };

    await setDoc(getCloudCycleDocRef(cycleId), {
      ...metadata,
      payloadJson: JSON.stringify(payload),
    });

    return { success: true, data: cycleId };
  } catch (error) {
    console.error('Error saving cloud cycle:', error);
    return {
      success: false,
      error: `Failed to save cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Loads a specific cloud cycle
 */
export const loadCloudCycle = async (
  userId: string,
  cycleId: string
): Promise<CloudOperationResult<CloudCycle>> => {
  try {
    const record = await fetchCloudCycleById({ userId, cycleId });

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

/**
 * Deletes a cloud cycle
 */
export const deleteCloudCycle = async (
  userId: string,
  cycleId: string
): Promise<CloudOperationResult> => {
  try {
    const existingCycle = await getOwnedCloudCycle({ userId, cycleId });
    if (!existingCycle) {
      return { success: true };
    }

    await deleteDoc(getCloudCycleDocRef(cycleId));

    return { success: true };
  } catch (error) {
    console.error('Error deleting cloud cycle:', error);
    return {
      success: false,
      error: `Failed to delete cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Renames a cloud cycle
 */
export const renameCloudCycle = async (
  userId: string,
  cycleId: string,
  newLabel: string
): Promise<CloudOperationResult> => {
  try {
    const existing = await getOwnedCloudCycle({ userId, cycleId });
    if (!existing) {
      return {
        success: false,
        error: 'Cloud cycle not found',
      };
    }

    const nextMetadata: CloudCycle = {
      ...existing,
      label: newLabel,
      updatedAt: new Date().toISOString(),
      payloadHash: computePayloadHash(existing.payload),
    };

    await setDoc(getCloudCycleDocRef(cycleId), serializeCloudCycleDocument(nextMetadata));

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
 * Lists all cloud cycles for a user (metadata only, not full payloads)
 */
export const listCloudCycles = async (
  userId: string
): Promise<CloudOperationResult<CloudCycleMetadata[]>> => {
  try {
    const cycles = await readCloudCyclesForUser(userId);
    const metadata = cycles.map(toCloudCycleMetadata);

    return { success: true, data: metadata };
  } catch (error) {
    console.error('Error listing cloud cycles:', error);
    return {
      success: false,
      error: `Failed to list cloud cycles: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Subscribes to cloud cycles list for real-time updates
 */
export const subscribeToCloudCycles = (
  userId: string,
  onUpdate: (cycles: CloudCycleMetadata[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  try {
    const cyclesQuery = query(getCloudCyclesCollectionRef(), where('userId', '==', userId));

    const unsubscribe = onSnapshot(
      cyclesQuery,
      async (querySnapshot) => {
        const cycles = readCloudCyclesFromQuery({ snapshot: querySnapshot, fallbackUserId: userId });

        if (cycles.length > 0) {
          onUpdate(cycles.map(toCloudCycleMetadata).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()));
          return;
        }

        const legacyCycles = await readLegacyCloudCycles(userId);
        if (legacyCycles.length > 0) {
          await migrateLegacyCloudCycles(userId, legacyCycles);
          onUpdate(legacyCycles.map(toCloudCycleMetadata).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()));
          return;
        }

        onUpdate([]);
      },
      (error) => {
        console.error('Error subscribing to cloud cycles:', error);
        onError?.(error as Error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up cloud cycles subscription:', error);
    if (onError && error instanceof Error) onError(error);
    return noopUnsubscribe;
  }
};

/**
 * Checks if a local cycle differs from the remote version
 */
export const hasRemoteChanges = (
  localPayload: GFCForecastSaveData,
  remoteMetadata: CloudCycleMetadata
): boolean => {
  const localHash = computePayloadHash(localPayload);
  return localHash !== remoteMetadata.payloadHash;
};
