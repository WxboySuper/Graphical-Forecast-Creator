import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getForecastWorkspace, requireForecastWorkspaceId } from '../config/forecastWorkspaces';
import type { GFCForecastSaveData } from '../types/outlooks';
import { validateForecastData } from './fileUtils';
import {
  createForecastWorkspaceSave,
  declaresWorkspaceEnvelope,
  isRecord,
  isWorkspaceSaveEnvelope,
} from './forecastWorkspaceEnvelope';
import type { ForecastWorkspaceSaveEnvelope } from './forecastWorkspaceEnvelope';

export {
  FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
  createForecastWorkspaceSave,
  getForecastDataFromWorkspacePayload,
} from './forecastWorkspaceEnvelope';
export type { ForecastWorkspacePayload, ForecastWorkspaceSaveEnvelope } from './forecastWorkspaceEnvelope';

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

const isWorkspaceId = (value: unknown): value is ForecastWorkspaceId =>
  typeof value === 'string' && getForecastWorkspace(value as ForecastWorkspaceId) !== undefined;

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
 * Declared envelopes and explicit workspace IDs are validated before legacy
 * payloads. Legacy payloads are classified with the validators for the requesting
 * workspace, so invalid or unknown owners cannot fall back to Severe.
 */
export const classifyForecastWorkspacePayload = (
  value: unknown,
  validators: ForecastWorkspaceLegacyValidators = {},
): ForecastWorkspaceClassification => {
  if (declaresWorkspaceEnvelope(value)) {
    if (!isWorkspaceSaveEnvelope(value)) {
      return classifyExplicitWorkspacePayload(value) ?? { ok: false, reason: 'invalid' };
    }
    if (!validateForecastData(value.forecast)) return { ok: false, reason: 'invalid' };
    return { ok: true, workspaceId: value.workspaceId, payload: value, legacy: false };
  }

  const explicitWorkspace = classifyExplicitWorkspacePayload(value);
  if (explicitWorkspace) return explicitWorkspace;

  return classifyLegacyForecastPayload(value, validators) ?? {
    ok: false,
    reason: 'unsupported-legacy-payload',
  };
};

/**
 * Builds the session payload for a cloud handoff.
 *
 * Explicit envelopes must name the requested workspace. Untagged legacy
 * payloads are only safe to adopt into Severe, where their historical owner is
 * known. Other workspaces must save an explicit owner before cloud handoff.
 */
const assertCloudWorkspaceMatches = (
  payloadWorkspaceId: ForecastWorkspaceId,
  workspaceId: ForecastWorkspaceId,
): void => {
  if (payloadWorkspaceId !== workspaceId) {
    throw new Error('Cloud payload belongs to a different forecast workspace.');
  }
};

export const buildCloudSessionPayload = (
  workspaceId: ForecastWorkspaceId,
  payload: unknown,
  validators: ForecastWorkspaceLegacyValidators = {},
): ForecastWorkspaceSaveEnvelope => {
  const owner = requireForecastWorkspaceId(workspaceId);
  const classification = classifyForecastWorkspacePayload(payload, validators);
  if (!classification.ok) throw getForecastWorkspaceLoadError(classification);

  if (classification.legacy === false) {
    assertCloudWorkspaceMatches(classification.workspaceId, owner);
    return classification.payload;
  }

  if (owner !== 'severe') {
    throw new Error(
      `This cloud cycle labels an untagged forecast as ${owner} workspace, which cannot be verified. Save it from that workspace to include its workspace identity.`,
    );
  }

  if (classification.workspaceId !== owner) {
    assertCloudWorkspaceMatches(classification.workspaceId, owner);
  }
  return createForecastWorkspaceSave(owner, classification.payload);
};

/**
 * Validators for one cloud load, built from the workspace that asked for it.
 *
 * Every workspace serializes the same `GFCForecastSaveData` shape, so an
 * untagged legacy payload carries no owner of its own and Severe's validator
 * would otherwise claim every save in the library. The cloud record is the
 * only Custom identity a legacy save has, so Severe claims an untagged payload
 * only for a Severe load and the Custom validator claims it for a Custom load,
 * which keeps a Custom record's payload from being classified as Severe before
 * the envelope is written. Input that fails both checks is rejected instead of
 * being staged.
 *
 * Severe still runs first inside the shared contract, so a Severe save with
 * embedded custom layers is never reclassified as Custom. #915 owns the
 * payload-level Custom schema that will replace the record-derived half of
 * this check.
 */
export const buildCloudLoadValidators = (
  workspaceId: ForecastWorkspaceId,
): ForecastWorkspaceLegacyValidators => ({
  isSeverePayload: (value): value is GFCForecastSaveData => {
    if (workspaceId === 'custom') return false;
    return validateForecastData(value);
  },
  isCustomPayload: (value): value is GFCForecastSaveData => {
    if (workspaceId !== 'custom') return false;
    return validateForecastData(value);
  },
});
