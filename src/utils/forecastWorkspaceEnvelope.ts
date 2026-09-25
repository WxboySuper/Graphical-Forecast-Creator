import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getForecastWorkspace, requireForecastWorkspaceId } from '../config/forecastWorkspaces';
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

/**
 * True when a value claims the envelope schema version, whether or not its owner
 * and forecast actually hold up. Readers branch on this first so a corrupt
 * envelope is rejected instead of falling through to the legacy path, which would
 * silently hand back an empty cycle.
 *
 * Workflow packages carry the semver string `'1.0.0'` as their schemaVersion, so
 * they never match here and keep flowing to their own wrapper handling.
 */
export const declaresWorkspaceEnvelope = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && value.schemaVersion === FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION;

/**
 * True when a value carries the envelope wrapper at all: the schema version and
 * an object-shaped forecast. This says nothing about who owns it, so a caller
 * that unwraps must pair it with `isWorkspaceSaveEnvelope`.
 */
export const hasWorkspaceEnvelopeWrapper = (value: unknown): value is Record<string, unknown> =>
  declaresWorkspaceEnvelope(value) &&
  isRecord(value.forecast);

/**
 * Validates the version, object shape, and a registered owner before anything
 * reads `forecast`. A declared owner this build does not know fails here rather
 * than being unwrapped and silently discarded as if the payload were unowned.
 */
export const isWorkspaceSaveEnvelope = (value: unknown): value is ForecastWorkspaceSaveEnvelope =>
  hasWorkspaceEnvelopeWrapper(value) &&
  typeof value.workspaceId === 'string' &&
  getForecastWorkspace(value.workspaceId) !== undefined;

/** Extracts the forecast data from either a new envelope or a legacy payload. */
export const getForecastDataFromWorkspacePayload = (
  payload: ForecastWorkspacePayload,
): GFCForecastSaveData => 'forecast' in payload ? payload.forecast : payload;
