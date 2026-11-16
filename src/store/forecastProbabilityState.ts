import type { OutlookDay, OutlookType } from '../types/outlooks';
import type { ForecastState } from './forecastSlice';

/** Clears completion acknowledgement after forecast content changes. */
export const invalidateCompletionAcknowledgement = (state: ForecastState) => {
  if (state.forecastCycle.completionAcknowledgedAt || state.forecastCycle.omittedDayReasons) {
    delete state.forecastCycle.completionAcknowledgedAt;
    delete state.forecastCycle.omittedDayReasons;
  }
  state.completionValidation.lastResult = null;
};

/** Ensures low-probability metadata exists before a reducer mutates it. */
export const ensureLowProbabilityOutlooks = (dayData: OutlookDay): OutlookType[] => {
  if (!dayData.metadata.lowProbabilityOutlooks) {
    dayData.metadata.lowProbabilityOutlooks = [];
  }
  return dayData.metadata.lowProbabilityOutlooks;
};

/** Returns whether a low-probability transition would change the current day. */
export const canSetLowProbabilityState = (
  state: ForecastState,
  outlookType: OutlookType,
  isLow: boolean,
): boolean => {
  const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!dayData) return false;

  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];
  const isCurrentlyLow = lowProbabilityOutlooks.includes(outlookType);
  return (isLow && !isCurrentlyLow) || (!isLow && isCurrentlyLow);
};

/** Applies a low-probability toggle and clears features when the outlook becomes low probability. */
export const applyLowProbabilityState = (
  state: ForecastState,
  outlookType: OutlookType,
  isLow: boolean,
) => {
  const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!dayData) return;

  const lowProbabilityOutlooks = ensureLowProbabilityOutlooks(dayData);
  const isCurrentlyLow = lowProbabilityOutlooks.includes(outlookType);

  if (isLow && !isCurrentlyLow) {
    lowProbabilityOutlooks.push(outlookType);
    dayData.data[outlookType]?.clear();
  } else if (!isLow && isCurrentlyLow) {
    dayData.metadata.lowProbabilityOutlooks = lowProbabilityOutlooks.filter((type) => type !== outlookType);
  }

  invalidateCompletionAcknowledgement(state);
  state.isSaved = false;
};
