import type { OutlookData } from '../types/outlooks';
import type { ForecastState } from './forecastSlice';

/** Replaces the active day with legacy imported outlook data while preserving TSTM overlays. */
export const applyLegacyForecastImport = (
  state: ForecastState,
  importedData: OutlookData,
  timestamp: string,
): void => {
  const currentDay = state.forecastCycle.currentDay;
  const dayData = state.forecastCycle.days[currentDay];
  if (!dayData) {
    state.isSaved = true;
    return;
  }

  const existingTstm = dayData.data.categorical?.get('TSTM') ?? [];
  dayData.data = importedData;

  if (dayData.data.categorical) {
    const importedTstm = dayData.data.categorical.get('TSTM') ?? [];
    const mergedTstm = [...existingTstm, ...importedTstm];
    if (mergedTstm.length > 0) dayData.data.categorical.set('TSTM', mergedTstm);
  }

  if (dayData.metadata.lowProbabilityOutlooks) {
    dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
      (outlookType) => !(dayData.data[outlookType] && dayData.data[outlookType].size > 0),
    );
  }

  dayData.metadata.lastModified = timestamp;
  state.isSaved = true;
};
