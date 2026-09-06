import type { ForecastCycle } from '../../types/outlooks';
import { downloadBlob } from '../fileUtils';
import { buildStructuredKmlDocument } from './buildKml';
import { buildSplitKmzArchive, buildStructuredKmzArchive } from './buildKmz';
import type { KmzExportOptions, KmzExportStrategy } from './types';

const buildFilename = (forecastCycle: ForecastCycle, options: KmzExportOptions, extension: 'kml' | 'kmz'): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const scope = options.scope === 'cycle'
    ? 'cycle'
    : `day-${options.day ?? forecastCycle.currentDay}`;
  return `gfc-${scope}-${timestamp}.${extension}`;
};

/** Downloads a plain KML file using the structured document strategy. */
export const downloadKmlExport = (
  forecastCycle: ForecastCycle,
  options: KmzExportOptions,
): void => {
  const kml = buildStructuredKmlDocument({ forecastCycle, options });
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  downloadBlob(blob, buildFilename(forecastCycle, options, 'kml'));
};

/** Downloads a KMZ archive using the selected prototype strategy. */
export const downloadKmzExport = async (
  forecastCycle: ForecastCycle,
  options: KmzExportOptions,
  strategy: KmzExportStrategy = options.strategy ?? 'structured-kml',
): Promise<void> => {
  const blob = strategy === 'split-kmz'
    ? await buildSplitKmzArchive({ forecastCycle, options })
    : await buildStructuredKmzArchive({ forecastCycle, options });

  downloadBlob(blob, buildFilename(forecastCycle, options, 'kmz'));
};

export { buildStructuredKmlDocument } from './buildKml';
export { buildSplitKmzArchive, buildStructuredKmzArchive } from './buildKmz';
export { collectKmzExportFeatures } from './collectFeatures';
export type { KmzExportFeature, KmzExportInput, KmzExportOptions, KmzExportStrategy, KmzExportScope } from './types';
