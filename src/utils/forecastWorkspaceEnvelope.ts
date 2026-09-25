import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { requireForecastWorkspaceId } from '../config/forecastWorkspaces';
import type { GFCForecastSaveData } from '../types/outlooks';

/**
 * Owns the workspace save envelope and nothing else.
 *
 * This module stays a leaf so package builders and file readers can create and
 * unwrap envelopes without importing the persistence module that validates
 * forecast data, which would close an import loop back into file utilities.
 */

/** Version of the workspace-aware save envelope, independent of forecast data version. */
export const FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION = 1 as const;

export interface ForecastWorkspaceSaveEnvelope {
  schemaVersion: typeof FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION;
  workspaceId: ForecastWorkspaceId;
  forecast: GFCForecastSaveData;
}

export type ForecastWorkspacePayload = ForecastWorkspaceSaveEnvelope | GFCForecastSaveData;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Creates the explicit envelope required for all new workspace-owned saves.
 * An unregistered or missing owner fails here instead of shipping a payload
 * that no workspace will accept on the way back in.
 */
export const createForecastWorkspaceSave = (
  workspaceId: ForecastWorkspaceId,
  forecast: GFCForecastSaveData,
): ForecastWorkspaceSaveEnvelope => ({
  schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
  workspaceId: requireForecastWorkspaceId(workspaceId),
  forecast,
});

/** Structural envelope check. The forecast inside is validated by the classifier. */
export const isWorkspaceSaveEnvelope = (value: unknown): value is ForecastWorkspaceSaveEnvelope =>
  isRecord(value) &&
  value.schemaVersion === FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION &&
  typeof value.workspaceId === 'string' &&
  isRecord(value.forecast);

/** Extracts the forecast data from either a new envelope or a legacy payload. */
export const getForecastDataFromWorkspacePayload = (
  payload: ForecastWorkspacePayload,
): GFCForecastSaveData => 'forecast' in payload ? payload.forecast : payload;
