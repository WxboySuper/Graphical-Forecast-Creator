import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import type { CycleMetadata, ForecastCycle, GFCForecastSaveData } from '../types/outlooks';
import { deserializeForecast, serializeForecast } from './fileUtils';
import {
  classifyForecastWorkspacePayload,
  createForecastWorkspaceSave,
  getForecastDataFromWorkspacePayload,
  type ForecastWorkspaceClassification,
  type ForecastWorkspaceLegacyValidators,
  type ForecastWorkspaceSaveEnvelope,
} from './forecastWorkspacePersistence';

export interface ForecastWorkspaceMapView {
  center: [number, number];
  zoom: number;
}

/** Serializes a forecast cycle into the explicit workspace-owned save format. */
export const serializeForecastWorkspace = (
  workspaceId: ForecastWorkspaceId,
  forecastCycle: ForecastCycle,
  mapView: ForecastWorkspaceMapView,
  cycleMetadata?: CycleMetadata,
): ForecastWorkspaceSaveEnvelope =>
  createForecastWorkspaceSave(workspaceId, serializeForecast(forecastCycle, mapView, cycleMetadata));

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

/** Classifies and deserializes a saved workspace payload without mutating app state. */
export const deserializeForecastWorkspace = (
  payload: unknown,
  validators?: ForecastWorkspaceLegacyValidators,
): { workspaceId: ForecastWorkspaceId; forecastCycle: ForecastCycle; mapView?: GFCForecastSaveData['mapView']; legacy: boolean } => {
  const classification = classifyForecastWorkspacePayload(payload, validators);
  if (!classification.ok) throw getForecastWorkspaceLoadError(classification);

  const forecast = getForecastDataFromWorkspacePayload(classification.payload);
  return {
    workspaceId: classification.workspaceId,
    forecastCycle: deserializeForecast(forecast),
    mapView: forecast.mapView,
    legacy: classification.legacy,
  };
};
