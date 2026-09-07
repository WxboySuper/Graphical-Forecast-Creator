import type { DayType, ForecastCycle } from '../types/outlooks';
import type { ForecastState } from './forecastSlice';
import { cloneIntegratedCustomLayers } from './forecastSnapshotHelpers';
import { clearHistory } from './forecastHistory';
import { copyCompatibleOutlooks } from './forecastRollover';
import { clearOutlookMaps, createEmptyOutlook } from './forecastStateFactory';

/** Copies compatible outlooks and custom layers from a source cycle into a target day. */
export const applyCopyFeaturesFromPrevious = (
  state: ForecastState,
  sourceCycle: ForecastCycle,
  sourceDay: DayType,
  targetDay: DayType,
  timestamp: string,
): void => {
  const sourceDayData = sourceCycle.days[sourceDay];
  if (!sourceDayData) return;

  if (!state.forecastCycle.days[targetDay]) {
    state.forecastCycle.days[targetDay] = createEmptyOutlook(targetDay, timestamp);
  }

  const targetDayData = state.forecastCycle.days[targetDay];
  if (!targetDayData) return;

  clearOutlookMaps(targetDayData.data);
  copyCompatibleOutlooks(sourceDayData.data, targetDayData.data, sourceDay, targetDay);
  targetDayData.customLayers = cloneIntegratedCustomLayers(sourceDayData.customLayers);
  targetDayData.metadata.lastModified = timestamp;
  clearHistory(state);
  state.isSaved = false;
};
