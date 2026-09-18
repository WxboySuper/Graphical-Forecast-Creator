import type { DayType, ForecastCycle } from '../../types/outlooks';
import type { WorkflowExportScope } from '../workflowPackage';
import type { KmzExportStrategy } from '../kmzExport';
import type { ForecastExportRequest, KmlArchiveStrategy } from './types';

/** Builds a timestamped filename for a forecast transfer export. */
export const buildTransferFilename = (
  forecastCycle: ForecastCycle,
  scope: ForecastExportRequest['scope'],
  day: DayType | undefined,
  extension: string,
): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const scopeLabel = scope === 'current-day'
    ? `day-${day ?? forecastCycle.currentDay}`
    : scope;
  return `gfc-${scopeLabel}-${timestamp}.${extension}`;
};

/** Maps the transfer archive option to the KMZ export strategy. */
export const toKmzStrategy = (strategy: KmlArchiveStrategy | undefined): KmzExportStrategy =>
  strategy === 'split' ? 'split-kmz' : 'structured-kml';

/** Maps a transfer scope to the workflow-package scope. */
export const toWorkflowScope = (scope: ForecastExportRequest['scope']): WorkflowExportScope =>
  scope === 'workflow' ? 'workflow' : 'cycle';

/** Maps a transfer scope to the KML export scope. */
export const toKmlScope = (scope: ForecastExportRequest['scope']): 'current-day' | 'cycle' =>
  scope === 'current-day' ? 'current-day' : 'cycle';
