import { readForecastImportFile, validateForecastDataReason } from '../fileUtils';
import type { CycleMetadata } from '../../types/workflow';
import type { ForecastImportResult, ForecastTransferMapView } from './types';
import { isWorkflowExportPackage } from '../workflowPackage';
import { deserializeForecastWorkspace } from '../forecastWorkspacePersistenceAdapter';
import { getForecastDataFromWorkspacePayload } from '../forecastWorkspacePersistence';
import { getForecastWorkspace, type ForecastWorkspaceId } from '../../config/forecastWorkspaces';

/** Imports a native JSON or workflow package transfer. */
export const importNativeTransfer = async (file: File, format: 'json' | 'package'): Promise<ForecastImportResult> => {
  const data = await readForecastImportFile(file);
  const validationError = validateForecastDataReason(data);
  if (validationError) throw new Error(validationError);
  if (isWorkflowExportPackage(data)) {
    const declaredWorkspaceId = typeof (data as { workspaceId?: unknown }).workspaceId === 'string'
      && getForecastWorkspace((data as { workspaceId: string }).workspaceId) !== undefined
      ? (data as { workspaceId: ForecastWorkspaceId }).workspaceId
      : null;
    const restored = deserializeForecastWorkspace(data.forecast);
    if (declaredWorkspaceId && !restored.legacy && declaredWorkspaceId !== restored.workspaceId) {
      throw new Error('This workflow package declares a workspace that does not match its forecast.');
    }
    const inner = getForecastDataFromWorkspacePayload(
      data.forecast as Parameters<typeof getForecastDataFromWorkspacePayload>[0],
    ) as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null };
    return {
      forecastCycle: restored.forecastCycle,
      workspaceId: declaredWorkspaceId ?? restored.workspaceId,
      mapView: data.mapView ?? inner.mapView,
      cycleMetadata: data.metadata ?? data.cycleMetadata ?? inner.cycleMetadata,
      warnings: [],
      format,
    };
  }
  const restored = deserializeForecastWorkspace(data);
  const rawData = getForecastDataFromWorkspacePayload(
    data as Parameters<typeof getForecastDataFromWorkspacePayload>[0],
  ) as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null };
  return {
    forecastCycle: restored.forecastCycle,
    workspaceId: restored.workspaceId,
    mapView: rawData.mapView,
    cycleMetadata: rawData.cycleMetadata,
    warnings: [],
    format,
  };
};
