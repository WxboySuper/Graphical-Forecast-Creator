import { readForecastImportFile } from '../fileUtils';
import type { CycleMetadata } from '../../types/workflow';
import type { ForecastImportResult, ForecastTransferMapView } from './types';
import { isWorkflowExportPackage } from '../workflowPackage';
import { deserializeForecastWorkspace } from '../forecastWorkspacePersistenceAdapter';
import { getForecastDataFromWorkspacePayload } from '../forecastWorkspacePersistence';

/** Imports a native JSON or workflow package transfer. */
export const importNativeTransfer = async (file: File, format: 'json' | 'package'): Promise<ForecastImportResult> => {
  const data = await readForecastImportFile(file);
  const restored = deserializeForecastWorkspace(data);
  const rawData = getForecastDataFromWorkspacePayload(
    data as Parameters<typeof getForecastDataFromWorkspacePayload>[0],
  ) as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null; metadata?: CycleMetadata };
  return {
    forecastCycle: restored.forecastCycle,
    workspaceId: restored.workspaceId,
    mapView: rawData.mapView,
    cycleMetadata: isWorkflowExportPackage(data) ? rawData.metadata : rawData.cycleMetadata,
    warnings: [],
    format,
  };
};
