import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import type { MesoscaleState } from '../store/mesoscaleSlice';
import { createInitialMesoscaleState } from '../store/mesoscaleSlice';
import { getScopedStorageKey, getStorageScope } from './storageScope';
import { getMesoscaleValidationError } from './mesoscaleValidation';

export const MESOSCALE_SAVE_SCHEMA_VERSION = 1 as const;
export interface MesoscaleSaveEnvelope {
  schemaVersion: typeof MESOSCALE_SAVE_SCHEMA_VERSION;
  workspaceId: 'mesoscale';
  product: MesoscaleState;
}
export type MesoscaleClassification = { ok: true; payload: MesoscaleSaveEnvelope } | { ok: false; reason: string };

const hasValidEnvelopeOwner = (record: Record<string, unknown>): boolean => record.workspaceId === 'mesoscale';
const hasSupportedSchema = (record: Record<string, unknown>): boolean => record.schemaVersion === MESOSCALE_SAVE_SCHEMA_VERSION;
const hasOnlyEnvelopeFields = (record: Record<string, unknown>): boolean =>
  Object.keys(record).every((key) => ['schemaVersion', 'workspaceId', 'product'].includes(key));

const getEnvelopeError = (record: Record<string, unknown>): string | null => {
  if (!hasOnlyEnvelopeFields(record)) return 'Mesoscale save contains unsupported fields.';
  if (!hasValidEnvelopeOwner(record)) return 'This save belongs to a different forecast workspace.';
  if (!hasSupportedSchema(record)) return 'Unsupported Mesoscale save version.';
  return getMesoscaleValidationError(record.product);
};

export const createMesoscaleSave = (product: MesoscaleState): MesoscaleSaveEnvelope => {
  const error = getMesoscaleValidationError(product);
  if (error) throw new Error(error);
  return { schemaVersion: MESOSCALE_SAVE_SCHEMA_VERSION, workspaceId: 'mesoscale', product };
};

export const classifyMesoscaleSave = (value: unknown): MesoscaleClassification => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, reason: 'Mesoscale save must be an object.' };
  const record = value as Record<string, unknown>;
  const error = getEnvelopeError(record);
  return error ? { ok: false, reason: error } : { ok: true, payload: record as unknown as MesoscaleSaveEnvelope };
};

export const restoreMesoscaleSave = (value: unknown): MesoscaleState => {
  const classification = classifyMesoscaleSave(value);
  if (!classification.ok) throw new Error(classification.reason);
  return classification.payload.product;
};

export const getMesoscaleStorageKey = (userId?: string | null): string =>
  getScopedStorageKey('forecastData:mesoscale', getStorageScope(userId));

export const loadMesoscaleAutosave = (userId?: string | null): MesoscaleState => {
  try {
    const text = localStorage.getItem(getMesoscaleStorageKey(userId));
    return text ? restoreMesoscaleSave(JSON.parse(text)) : createInitialMesoscaleState();
  } catch {
    return createInitialMesoscaleState();
  }
};

export const saveMesoscaleAutosave = (product: MesoscaleState, userId?: string | null): void => {
  localStorage.setItem(getMesoscaleStorageKey(userId), JSON.stringify(createMesoscaleSave(product)));
};

export const exportMesoscaleJson = (product: MesoscaleState): { filename: string; json: string } => ({
  filename: `gfc-mesoscale-forecast-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  json: JSON.stringify(createMesoscaleSave(product), null, 2),
});

export const importMesoscaleJson = (json: string, expectedWorkspace: ForecastWorkspaceId = 'mesoscale'): MesoscaleState => {
  if (expectedWorkspace !== 'mesoscale') throw new Error('Mesoscale files can only be imported into the Mesoscale workspace.');
  try { return restoreMesoscaleSave(JSON.parse(json) as unknown); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'Mesoscale file is invalid.'); }
};
