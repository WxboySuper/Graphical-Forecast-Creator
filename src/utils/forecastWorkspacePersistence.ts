import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getForecastWorkspace } from '../config/forecastWorkspaces';
import type { GFCForecastSaveData } from '../types/outlooks';
import { validateForecastData } from './fileUtils';
import {
  isRecord,
  isWorkspaceSaveEnvelope,
  type ForecastWorkspacePayload,
  type ForecastWorkspaceSaveEnvelope,
} from './forecastWorkspaceEnvelope';

export {
  FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
  createForecastWorkspaceSave,
  getForecastDataFromWorkspacePayload,
} from './forecastWorkspaceEnvelope';
export type { ForecastWorkspaceSaveEnvelope, ForecastWorkspacePayload } from './forecastWorkspaceEnvelope';

export type ForecastWorkspaceClassification =
  | { ok: true; workspaceId: ForecastWorkspaceId; payload: ForecastWorkspacePayload; legacy: boolean }
  | { ok: false; reason: 'invalid' | 'unknown-workspace' | 'unsupported-legacy-payload' };

export interface ForecastWorkspaceLegacyValidators {
  /** Recognizes the existing Severe save shape, including embedded custom layers. */
  isSeverePayload?: (value: unknown) => value is GFCForecastSaveData;
  /** Recognizes a legacy Custom payload owned by the Custom workspace. */
  isCustomPayload?: (value: unknown) => value is GFCForecastSaveData;
}

const isWorkspaceId = (value: unknown): value is ForecastWorkspaceId =>
  typeof value === 'string' && getForecastWorkspace(value as ForecastWorkspaceId) !== undefined;

const isEnvelope = (value: unknown): value is ForecastWorkspaceSaveEnvelope =>
  isWorkspaceSaveEnvelope(value) &&
  isWorkspaceId(value.workspaceId) &&
  validateForecastData(value.forecast);

/**
 * Classifies a saved payload before it is opened in a workspace.
 *
 * Explicit workspace identity always wins. Legacy payloads are checked as
 * Severe first so a valid Severe save containing custom layers is never
 * reclassified as Custom merely because it contains those layers. An untagged
 * legacy payload cannot be safely identified as Custom from its shared schema,
 * so it remains Severe-owned; Custom saves must carry the workspace envelope.
 *
 * This intentionally does not reuse resolveForecastWorkspaceId: an explicit but
 * unknown workspaceId must reject as 'unknown-workspace' instead of falling
 * back to Severe, so corrupt envelopes cannot silently open in the wrong workspace.
 */
export const classifyForecastWorkspacePayload = (
  value: unknown,
  validators: ForecastWorkspaceLegacyValidators = {},
): ForecastWorkspaceClassification => {
  if (isEnvelope(value)) {
    return { ok: true, workspaceId: value.workspaceId, payload: value, legacy: false };
  }

  if (isRecord(value) && value.workspaceId !== undefined) {
    return isWorkspaceId(value.workspaceId)
      ? { ok: false, reason: 'invalid' }
      : { ok: false, reason: 'unknown-workspace' };
  }

  const isSeverePayload = validators.isSeverePayload ?? validateForecastData;
  if (isSeverePayload(value)) {
    return { ok: true, workspaceId: 'severe', payload: value, legacy: true };
  }

  if (validators.isCustomPayload?.(value)) {
    return { ok: true, workspaceId: 'custom', payload: value, legacy: true };
  }

  return { ok: false, reason: 'unsupported-legacy-payload' };
};
