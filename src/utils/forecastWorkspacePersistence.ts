import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getForecastWorkspace } from '../config/forecastWorkspaces';
import type { GFCForecastSaveData } from '../types/outlooks';
import { validateForecastData } from './fileUtils';

/** Version of the workspace-aware save envelope, independent of forecast data version. */
export const FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION = 1 as const;

export interface ForecastWorkspaceSaveEnvelope {
  schemaVersion: typeof FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION;
  workspaceId: ForecastWorkspaceId;
  forecast: GFCForecastSaveData;
}

export type ForecastWorkspacePayload = ForecastWorkspaceSaveEnvelope | GFCForecastSaveData;

export type ForecastWorkspaceClassification =
  | { ok: true; workspaceId: ForecastWorkspaceId; payload: ForecastWorkspaceSaveEnvelope; legacy: false }
  | { ok: true; workspaceId: ForecastWorkspaceId; payload: GFCForecastSaveData; legacy: true }
  | { ok: false; reason: 'invalid' | 'unknown-workspace' | 'unsupported-legacy-payload' };

export interface ForecastWorkspaceLegacyValidators {
  /** Recognizes the existing Severe save shape, including embedded custom layers. */
  isSeverePayload?: (value: unknown) => value is GFCForecastSaveData;
  /** Recognizes a legacy Custom payload owned by the Custom workspace. */
  isCustomPayload?: (value: unknown) => value is GFCForecastSaveData;
}

/** Returns an actionable error for a payload that cannot be opened in a workspace. */
export const getForecastWorkspaceLoadError = (
  classification: Extract<ForecastWorkspaceClassification, { ok: false }>,
): Error => {
  switch (classification.reason) {
    case 'unknown-workspace':
      return new Error('This forecast belongs to an unknown workspace.');
    case 'invalid':
      return new Error('This workspace forecast is incomplete or invalid.');
    case 'unsupported-legacy-payload':
      return new Error('This forecast format is not supported by any workspace.');
  }
};

/** Creates the explicit envelope required for all new workspace-owned saves. */
export const createForecastWorkspaceSave = (
  workspaceId: ForecastWorkspaceId,
  forecast: GFCForecastSaveData,
): ForecastWorkspaceSaveEnvelope => ({
  schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
  workspaceId,
  forecast,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWorkspaceId = (value: unknown): value is ForecastWorkspaceId =>
  typeof value === 'string' && getForecastWorkspace(value as ForecastWorkspaceId) !== undefined;

const isEnvelope = (value: unknown): value is ForecastWorkspaceSaveEnvelope =>
  isRecord(value) &&
  value.schemaVersion === FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION &&
  isWorkspaceId(value.workspaceId) &&
  validateForecastData(value.forecast);

/**
 * Classifies a saved payload before it is opened in a workspace.
 *
 * Explicit workspace identity always wins. Legacy payloads are checked as
 * Severe first so a valid Severe save containing custom layers is never
 * reclassified as Custom merely because it contains those layers.
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

  const isCustomPayload = validators.isCustomPayload;
  if (isCustomPayload && isCustomPayload(value)) {
    return { ok: true, workspaceId: 'custom', payload: value, legacy: true };
  }

  return { ok: false, reason: 'unsupported-legacy-payload' };
};

/** Extracts the forecast data from either a new envelope or a legacy payload. */
export const getForecastDataFromWorkspacePayload = (
  payload: ForecastWorkspacePayload,
): GFCForecastSaveData => 'forecast' in payload ? payload.forecast : payload;

/**
 * Builds the session payload for a cloud handoff.
 *
 * The payload is classified with real validators before anything is written:
 * an invalid or unknown envelope throws instead of being wrapped as forecast
 * data, an explicit envelope must name the workspace that opened it, and a
 * payload a Custom validator recognized stays Custom. Legacy saves carry no
 * identity of their own, so the workspace that opened the cycle owns them.
 */
export const buildCloudSessionPayload = (
  workspaceId: ForecastWorkspaceId,
  payload: unknown,
  validators: ForecastWorkspaceLegacyValidators = {},
): ForecastWorkspaceSaveEnvelope => {
  const classification = classifyForecastWorkspacePayload(payload, validators);
  if (!classification.ok) throw getForecastWorkspaceLoadError(classification);

  if (!classification.legacy) {
    if (classification.workspaceId !== workspaceId) {
      throw new Error('Cloud payload belongs to a different forecast workspace.');
    }
    return classification.payload;
  }

  if (classification.workspaceId === 'custom' && workspaceId !== 'custom') {
    throw new Error('Cloud payload belongs to a different forecast workspace.');
  }
  return createForecastWorkspaceSave(workspaceId, classification.payload);
};
