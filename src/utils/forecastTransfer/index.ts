import {
  downloadGfcPackage,
  downloadBlob,
} from '../fileUtils';
import { downloadKmzExport } from '../kmzExport';
import { serializeForecastWorkspace } from '../forecastWorkspacePersistenceAdapter';
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
import { isFeatureExposed } from '../../config/featureExposure';
import { GIS_ENTRY_WORKSPACE } from './importPolicy';

/** Downloads a workspace-owned native JSON transfer so identity survives round-trips. */
const downloadWorkspaceJsonTransfer = (
  request: Pick<ForecastExportRequest, 'forecastCycle' | 'mapView' | 'cycleMetadata' | 'workspaceId'>,
): void => {
  const { workspaceId } = request;
  const payload = serializeForecastWorkspace(workspaceId, request.forecastCycle, request.mapView, request.cycleMetadata);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `gfc-forecast-${timestamp}.json`,
  );
};

/**
 * Guards KML/KMZ export behind the same two conditions the transfer modal uses:
 * the Severe entry workspace and the `kmzExport` feature gate. GIS geometry is a
 * Severe-only, feature-gated capability, not a claim about who owns a file, so
 * the UI and this API expose the formats identically.
 */
const assertSevereKmlExport = (format: ForecastExportRequest['format'], workspaceId: ForecastExportRequest['workspaceId']): void => {
  if (format !== 'kml' && format !== 'kmz') return;
  if (workspaceId !== GIS_ENTRY_WORKSPACE) {
    throw new Error('KML/KMZ export is only available in the Severe workspace. Switch to Severe to export GIS geometry.');
  }
  if (!isFeatureExposed('kmzExport')) {
    throw new Error('KML/KMZ export is not available in this build.');
  }
};

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
    workspaceId,
  } = request;

  assertSevereKmlExport(format, workspaceId);

  if (format === 'json') {
    downloadWorkspaceJsonTransfer({ forecastCycle, mapView, cycleMetadata, workspaceId });
    return;
  }

  if (format === 'package') {
    await downloadGfcPackage(forecastCycle, mapView, cycleMetadata, toWorkflowScope(scope), workspaceId);
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
