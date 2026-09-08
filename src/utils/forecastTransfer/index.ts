/**
 * Exposes the forecast transfer import, export, and package-download API.
 * This module owns the public transfer boundary and re-exports; format-specific serialization and validation remain in dedicated helpers.
 */
import {
  exportForecastToJson,
  downloadGfcPackage,
  downloadBlob,
} from '../fileUtils';
import { downloadKmzExport } from '../kmzExport';
import type { ForecastCycle, DayType } from '../../types/outlooks';
import type {
  ForecastExportRequest,
  ForecastImportResult,
} from './types';
import {
  buildTransferFilename,
  toKmzStrategy,
  toKmlScope,
  toWorkflowScope,
} from './transferExportUtils';
import { importTransferFile } from './transferImportUtils';

/** Exports a forecast using the requested transfer format and scope. */
export const exportForecastTransfer = async (request: ForecastExportRequest): Promise<void> => {
  const {
    format,
    scope,
    forecastCycle,
    mapView,
    cycleMetadata,
    day,
    kmlStrategy,
    outlookTypes,
  } = request;

  if (format === 'json') {
    exportForecastToJson(forecastCycle, mapView, cycleMetadata);
    return;
  }

  if (format === 'package') {
    await downloadGfcPackage(forecastCycle, mapView, cycleMetadata, toWorkflowScope(scope));
    return;
  }

  const kmlScope = toKmlScope(scope);
  const kmlOptions = {
    scope: kmlScope,
    day: kmlScope === 'current-day' ? (day ?? forecastCycle.currentDay) : undefined,
    strategy: toKmzStrategy(kmlStrategy),
    outlookTypes,
  };

  if (format === 'kml') {
    const { buildStructuredKmlDocument } = await import('../kmzExport/buildKml');
    const kml = buildStructuredKmlDocument({ forecastCycle, options: kmlOptions });
    downloadBlob(
      new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
      buildTransferFilename(forecastCycle, scope, day, 'kml'),
    );
    return;
  }

  await downloadKmzExport(forecastCycle, kmlOptions, kmlOptions.strategy);
};

/** Imports a forecast file and adapts supported formats to the GFC schema. */
export const importForecastTransfer = (
  file: File,
  options?: { baseCycle?: ForecastCycle; defaultDay?: DayType },
): Promise<ForecastImportResult> => {
  return importTransferFile(file, options);
};

export { detectForecastTransferFormat } from './detectFormat';
export type {
  ForecastExportRequest,
  ForecastImportResult,
  ForecastTransferFormat,
  ForecastTransferScope,
  ForecastTransferMapView,
  KmlArchiveStrategy,
} from './types';
