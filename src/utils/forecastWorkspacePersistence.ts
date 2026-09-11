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
  | { ok: true; workspaceId: ForecastWorkspaceId; payload: ForecastWorkspacePayload; legacy: boolean }
  | { ok: false; reason: 'invalid' | 'unknown-workspace' | 'unsupported-legacy-payload' };

export interface ForecastWorkspaceLegacyValidators {
  /** Recognizes the existing Severe save shape, including embedded custom layers. */
  isSeverePayload?: (value: unknown) => value is GFCForecastSaveData;
  /** Recognizes a legacy Custom payload owned by the Custom workspace. */
  isCustomPayload?: (value: unknown) => value is GFCForecastSaveData;
}

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

/** Extracts the forecast data from either a new envelope or a legacy payload. */
export const getForecastDataFromWorkspacePayload = (
  payload: ForecastWorkspacePayload,
): GFCForecastSaveData => 'forecast' in payload ? payload.forecast : payload;
