import {
  collection,
  deleteDoc,
  deleteDoc as removeDoc,
  doc,
  getDocs,
  query,
  setDoc,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  WORKFLOW_AWARENESS_CONSENT_VERSION,
  WORKFLOW_AWARENESS_SCHEMA_VERSION,
  type WorkflowAwarenessConsent,
  type WorkflowAwarenessMetadata,
  type WorkflowAwarenessRecord,
  type WorkflowAwarenessDocument,
  isCurrentAwarenessConsent,
} from '../types/workflowAwareness';

const AWARENESS_COLLECTION = 'workflowAwareness';

const RECORD_KEYS = ['consentVersion', 'schemaVersion', 'metadata'];
const FLAT_RECORD_KEYS = ['consentVersion', 'schemaVersion', 'cycleId', 'workflowId', 'cycleDate', 'status', 'outlookVersions', 'createdAt', 'updatedAt'];
const METADATA_KEYS = ['cycleId', 'workflowId', 'cycleDate', 'status', 'outlookVersions', 'createdAt', 'updatedAt'];
const VERSION_KEYS = ['version', 'status', 'createdAt', 'derivedFrom'];
const CYCLE_STATUSES = new Set(['in-progress', 'completed', 'completed-with-omissions']);
const OUTLOOK_STATUSES = new Set(['in-progress', 'completed', 'skipped', 'omitted']);

type AwarenessSnapshot = QuerySnapshot<DocumentData>;

/** Compares an object's keys with an exact allowlist. */
const sortedKeysEqual = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};

/** Checks that a persisted string field is present and non-blank. */
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Validates one privacy-safe outlook version entry. */
const isValidOutlookVersion = (value: unknown): value is WorkflowAwarenessRecord['outlookVersions'][number] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const version = value as Record<string, unknown>;
  if (!Object.keys(version).every((key) => VERSION_KEYS.includes(key))) return false;
  if (!['version', 'status', 'createdAt'].every((key) => key in version)) return false;
  if (typeof version.version !== 'number' || !Number.isInteger(version.version) || version.version < 1) return false;
  if (typeof version.status !== 'string' || !OUTLOOK_STATUSES.has(version.status)) return false;
  if (!isNonEmptyString(version.createdAt)) return false;
  return version.derivedFrom === undefined
    || (typeof version.derivedFrom === 'number' && Number.isInteger(version.derivedFrom) && version.derivedFrom >= 1);
};

/** Validates the exact persisted record shape, including the nested allowlist. */
export const isValidWorkflowAwarenessRecord = (value: unknown): value is WorkflowAwarenessRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!sortedKeysEqual(record, FLAT_RECORD_KEYS)) return false;
  if (record.consentVersion !== WORKFLOW_AWARENESS_CONSENT_VERSION || record.schemaVersion !== WORKFLOW_AWARENESS_SCHEMA_VERSION) return false;
  if (!isNonEmptyString(record.cycleId) || !isNonEmptyString(record.workflowId) || !isNonEmptyString(record.cycleDate)) return false;
  if (typeof record.status !== 'string' || !CYCLE_STATUSES.has(record.status)) return false;
  if (!Array.isArray(record.outlookVersions) || !record.outlookVersions.every(isValidOutlookVersion)) return false;
  return isNonEmptyString(record.createdAt) && isNonEmptyString(record.updatedAt);
};

/** Validates the nested Firestore document shape and its metadata allowlist. */
export const isValidWorkflowAwarenessDocument = (value: unknown): value is WorkflowAwarenessDocument => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as Record<string, unknown>;
  if (!sortedKeysEqual(document, RECORD_KEYS)) return false;
  if (document.consentVersion !== WORKFLOW_AWARENESS_CONSENT_VERSION || document.schemaVersion !== WORKFLOW_AWARENESS_SCHEMA_VERSION) return false;
  if (!document.metadata || typeof document.metadata !== 'object' || Array.isArray(document.metadata)) return false;
  return isValidWorkflowAwarenessRecord({
    ...(document.metadata as Record<string, unknown>),
    consentVersion: document.consentVersion,
    schemaVersion: document.schemaVersion,
  });
};

/** Validates the metadata subset before it is wrapped into a Firestore document. */
export const isValidWorkflowAwarenessMetadata = (value: unknown): value is WorkflowAwarenessMetadata => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  if (!sortedKeysEqual(metadata, METADATA_KEYS)) return false;
  return isValidWorkflowAwarenessRecord({
    ...metadata,
    consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
    schemaVersion: WORKFLOW_AWARENESS_SCHEMA_VERSION,
  });
};

/** Returns the current user's isolated awareness collection. */
const getAwarenessCollection = (userId: string) => {
  if (!db) throw new Error('Firestore is not initialized');
  return collection(db, 'users', userId, AWARENESS_COLLECTION);
};

/** Returns one awareness document reference without accessing cycle documents. */
const getAwarenessDoc = (userId: string, cycleId: string) => doc(getAwarenessCollection(userId), cycleId);

const toRecord = (metadata: WorkflowAwarenessMetadata): WorkflowAwarenessDocument => ({
  consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
  schemaVersion: WORKFLOW_AWARENESS_SCHEMA_VERSION,
  metadata,
});

const readSnapshotRecords = (snapshot: AwarenessSnapshot): { valid: WorkflowAwarenessRecord[]; malformedIds: string[] } => {
  const valid: WorkflowAwarenessRecord[] = [];
  const malformedIds: string[] = [];
  snapshot.docs.forEach((entry) => {
    const value = entry.data();
    if (isValidWorkflowAwarenessDocument(value)) {
      valid.push({
        ...(value as WorkflowAwarenessDocument).metadata,
        consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
        schemaVersion: WORKFLOW_AWARENESS_SCHEMA_VERSION,
      });
    } else {
      malformedIds.push(entry.id);
    }
  });
  return { valid, malformedIds };
};

/** Serializes all writes for one user so a disable/delete cannot race a metadata save. */
export class WorkflowAwarenessWriteQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export const createWorkflowAwarenessWriteQueue = (): WorkflowAwarenessWriteQueue => new WorkflowAwarenessWriteQueue();

export const saveWorkflowAwareness = async ({
  userId,
  metadata,
  consent,
}: {
  userId: string;
  metadata: WorkflowAwarenessMetadata;
  consent: WorkflowAwarenessConsent;
}): Promise<void> => {
  if (!isCurrentAwarenessConsent(consent)) return;
  if (!isValidWorkflowAwarenessMetadata(metadata)) throw new Error('Invalid workflow awareness metadata');
  await setDoc(getAwarenessDoc(userId, metadata.cycleId), toRecord(metadata));
};

/** Reads only the current user's nested awareness records and removes malformed records from that same path. */
export const listWorkflowAwareness = async ({
  userId,
  consent,
}: {
  userId: string;
  consent: WorkflowAwarenessConsent;
}): Promise<WorkflowAwarenessRecord[]> => {
  if (!isCurrentAwarenessConsent(consent)) return [];
  const snapshot = await getDocs(query(getAwarenessCollection(userId)));
  const { valid, malformedIds } = readSnapshotRecords(snapshot);
  // A malformed record must not hide valid recommendations if its cleanup is
  // temporarily unavailable; the next refresh will retry the deletion.
  await Promise.allSettled(malformedIds.map((cycleId) => deleteDoc(getAwarenessDoc(userId, cycleId))));
  return valid;
};

/** Deletes every awareness record for the current user; never touches full cloud-cycle documents. */
export const deleteWorkflowAwareness = async (userId: string): Promise<void> => {
  const snapshot = await getDocs(query(getAwarenessCollection(userId)));
  await Promise.all(snapshot.docs.map((entry) => removeDoc(getAwarenessDoc(userId, entry.id))));
};

export const deleteOneWorkflowAwareness = async (userId: string, cycleId: string): Promise<void> => {
  await deleteDoc(getAwarenessDoc(userId, cycleId));
};

/** Exposes the exact fields used by the dashboard rules handoff for tests and review tooling. */
export const getWorkflowAwarenessAllowlist = (): readonly string[] => RECORD_KEYS;
export const getWorkflowAwarenessMetadataAllowlist = (): readonly string[] => METADATA_KEYS;
