import type { ForecastState } from './forecastSlice';
import { clearHistory } from './forecastHistory';
import { createEmptyOutlook } from './forecastStateFactory';

interface ResetForecastOptions {
  today: string;
  timestamp: string;
}

/** Resets the active forecast while preserving the user's saved-cycle library. */
export const resetForecastState = (
  state: ForecastState,
  { today, timestamp }: ResetForecastOptions,
): void => {
  clearHistory(state);
  state.discussionDraftsByScope = {};
  state.forecastCycle = {
    days: { 1: createEmptyOutlook(1, timestamp) },
    currentDay: 1,
    cycleDate: today,
  };
  state.isSaved = false;
  state.outlookVersionSnapshots = [];
  state.workflowMetadata = undefined;
  state.workflowTemplate = undefined;
  state.isWorkflowActive = false;
};
