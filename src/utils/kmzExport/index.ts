import type { ForecastCycle } from '../../types/outlooks';
import { downloadBlob } from '../fileUtils';
import { buildSplitKmzArchive, buildStructuredKmzArchive } from './buildKmz';
import type { KmzExportOptions, KmzExportStrategy } from './types';

/** Builds a timestamped filename for a KMZ export. */
const buildFilename = (forecastCycle: ForecastCycle, options: KmzExportOptions): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const scope = options.scope === 'cycle'
    ? 'cycle'
    : `day-${options.day ?? forecastCycle.currentDay}`;
  return `gfc-${scope}-${timestamp}.kmz`;
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

  downloadBlob(blob, buildFilename(forecastCycle, options));
};

export { buildStructuredKmlDocument } from './buildKml';
export { buildSplitKmzArchive, buildStructuredKmzArchive } from './buildKmz';
export { collectKmzExportFeatures } from './collectFeatures';
export type { KmzExportFeature, KmzExportInput, KmzExportOptions, KmzExportStrategy, KmzExportScope } from './types';
