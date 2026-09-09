import { deserializeForecast, readForecastImportFile, validateForecastDataReason } from '../fileUtils';
import type { CycleMetadata } from '../../types/workflow';
import type { ForecastImportResult, ForecastTransferMapView } from './types';
import { isWorkflowExportPackage } from '../workflowPackage';

/** Imports a native JSON or workflow package transfer. */
export const importNativeTransfer = async (file: File, format: 'json' | 'package'): Promise<ForecastImportResult> => {
  const data = await readForecastImportFile(file);
  const validationError = validateForecastDataReason(data);
  if (validationError) throw new Error(validationError);
  const rawData = data as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null; metadata?: CycleMetadata };
  return { forecastCycle: deserializeForecast(data), mapView: rawData.mapView, cycleMetadata: isWorkflowExportPackage(data) ? rawData.metadata : rawData.cycleMetadata, warnings: [], format };
};
