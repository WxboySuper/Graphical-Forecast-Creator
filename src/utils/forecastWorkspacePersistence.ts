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

const classifyLegacySeverePayload = (
  value: unknown,
  validators: ForecastWorkspaceLegacyValidators,
): Extract<ForecastWorkspaceClassification, { ok: true }> | null => {
  const severeValidator = validators.isSeverePayload;
  if (severeValidator) {
    if (severeValidator(value)) {
      return { ok: true, workspaceId: 'severe', payload: value, legacy: true };
    }
    return null;
  }

  if (validators.isCustomPayload) return null;
  if (!validateForecastData(value)) return null;
  return { ok: true, workspaceId: 'severe', payload: value, legacy: true };
};

const classifyLegacyCustomPayload = (
  value: unknown,
  validators: ForecastWorkspaceLegacyValidators,
): Extract<ForecastWorkspaceClassification, { ok: true }> | null => {
  const customValidator = validators.isCustomPayload;
  if (customValidator) {
    if (customValidator(value)) {
      return { ok: true, workspaceId: 'custom', payload: value, legacy: true };
    }
  }
  return null;
};

const classifyLegacyForecastPayload = (
  value: unknown,
  validators: ForecastWorkspaceLegacyValidators,
): Extract<ForecastWorkspaceClassification, { ok: true }> | null => {
  const severe = classifyLegacySeverePayload(value, validators);
  if (severe) return severe;
  return classifyLegacyCustomPayload(value, validators);
};

const classifyExplicitWorkspacePayload = (value: unknown): Extract<ForecastWorkspaceClassification, { ok: false }> | null => {
  if (!isRecord(value)) return null;
  if (value.workspaceId === undefined) return null;
  if (isWorkspaceId(value.workspaceId)) return { ok: false, reason: 'invalid' };
  return { ok: false, reason: 'unknown-workspace' };
};

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

  const explicitWorkspace = classifyExplicitWorkspacePayload(value);
  if (explicitWorkspace) return explicitWorkspace;

  return classifyLegacyForecastPayload(value, validators) ?? {
    ok: false,
    reason: 'unsupported-legacy-payload',
  };
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
const assertCloudWorkspaceMatches = (
  payloadWorkspaceId: ForecastWorkspaceId,
  workspaceId: ForecastWorkspaceId,
): void => {
  if (payloadWorkspaceId !== workspaceId) {
    throw new Error('Cloud payload belongs to a different forecast workspace.');
  }
};

const assertLegacyCloudWorkspaceMatches = (
  classification: Extract<ForecastWorkspaceClassification, { ok: true }>,
  workspaceId: ForecastWorkspaceId,
  validators: ForecastWorkspaceLegacyValidators,
): void => {
  if (validators.isSeverePayload) {
    assertCloudWorkspaceMatches(classification.workspaceId, workspaceId);
  }
  if (validators.isCustomPayload) {
    assertCloudWorkspaceMatches(classification.workspaceId, workspaceId);
  }
};

export const buildCloudSessionPayload = (
  workspaceId: ForecastWorkspaceId,
  payload: unknown,
  validators: ForecastWorkspaceLegacyValidators = {},
): ForecastWorkspaceSaveEnvelope => {
  const classification = classifyForecastWorkspacePayload(payload, validators);
  if (!classification.ok) throw getForecastWorkspaceLoadError(classification);

  if (!classification.legacy) {
    assertCloudWorkspaceMatches(classification.workspaceId, workspaceId);
    return classification.payload;
  }

  // Explicit validators express the owner requested by this cloud load. Keep
  // the default legacy adoption path for callers without workspace validators.
  assertLegacyCloudWorkspaceMatches(classification, workspaceId, validators);
  return createForecastWorkspaceSave(workspaceId, classification.payload);
};

/**
 * Validators for one cloud load, built from the workspace that asked for it.
 *
 * Untagged saves predate workspace ownership and have no reliable identity.
 * Preserve the historical Severe default, and reject them for other workspaces
 * until a workspace-specific payload schema can identify them. New Custom saves
 * carry an explicit envelope, so they remain loadable without guessing.
 */
export const buildCloudLoadValidators = (
  workspaceId: ForecastWorkspaceId,
): ForecastWorkspaceLegacyValidators => ({
  isSeverePayload: (value): value is GFCForecastSaveData =>
    workspaceId === 'severe' && validateForecastData(value),
});
