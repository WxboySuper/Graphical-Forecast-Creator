import type { CycleMetadata, CycleStatus, OutlookStatus, OutlookVersion } from '../types/workflow';

/** Firestore's bounded nested metadata contract for one workflow cycle. */
export const MAX_OUTLOOK_VERSIONS = 32;

const CYCLE_STATUSES: readonly CycleStatus[] = [
  'in-progress',
  'completed',
  'completed-with-omissions',
];

const OUTLOOK_STATUSES: readonly OutlookStatus[] = [
  'in-progress',
  'completed',
  'skipped',
  'omitted',
];

/** Narrows unknown input to a non-array object record. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Ensures a contract object contains only its required and optional keys. */
const hasExactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => key in value) && keys.every((key) => allowed.has(key));
};

/** Validates one nested outlook version without accepting payload or UI fields. */
export const isMetadataOnlyOutlookVersion = (value: unknown): value is OutlookVersion => {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'status', 'createdAt'], ['derivedFrom'])) {
    return false;
  }

  const version = value.version;
  const status = value.status;
  const createdAt = value.createdAt;

  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > MAX_OUTLOOK_VERSIONS ||
    typeof status !== 'string' ||
    !OUTLOOK_STATUSES.includes(status as OutlookStatus) ||
    typeof createdAt !== 'string' ||
    createdAt.length === 0
  ) {
    return false;
  }

  const derivedFrom = value.derivedFrom;
  return !('derivedFrom' in value) || (
    typeof derivedFrom === 'number' &&
    Number.isInteger(derivedFrom) &&
    derivedFrom >= 1 &&
    derivedFrom <= MAX_OUTLOOK_VERSIONS
  );
};

/** Validates the exact workflow metadata object persisted inside a cloud cycle. */
export const isValidWorkflowMetadata = (value: unknown): value is CycleMetadata => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id',
    'workflowId',
    'cycleDate',
    'status',
    'outlookVersions',
    'createdAt',
    'updatedAt',
  ])) {
    return false;
  }

  return (
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.workflowId === 'string' && value.workflowId.length > 0 &&
    typeof value.cycleDate === 'string' && value.cycleDate.length > 0 &&
    typeof value.status === 'string' && CYCLE_STATUSES.includes(value.status as CycleStatus) &&
    Array.isArray(value.outlookVersions) &&
    value.outlookVersions.length <= MAX_OUTLOOK_VERSIONS &&
    value.outlookVersions.every(isMetadataOnlyOutlookVersion) &&
    typeof value.createdAt === 'string' && value.createdAt.length > 0 &&
    typeof value.updatedAt === 'string' && value.updatedAt.length > 0
  );
};
