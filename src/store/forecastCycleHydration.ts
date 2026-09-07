import type { ForecastCycle } from '../types/outlooks';
import { clearHistory } from './forecastHistory';
import type { ForecastState } from './forecastSlice';

interface ForecastCycleHydrationOptions {
  preserveDiscussionDrafts?: boolean;
}

/** Loads a complete cycle and resets transient workflow state shared by import and restore actions. */
export const hydrateForecastCycle = (
  state: ForecastState,
  cycle: ForecastCycle,
  { preserveDiscussionDrafts = false }: ForecastCycleHydrationOptions = {},
): void => {
  state.forecastCycle = cycle;
  if (!preserveDiscussionDrafts) {
    state.discussionDraftsByScope = {};
  }
  clearHistory(state);
  state.isSaved = true;
  state.outlookVersionSnapshots = [];
  state.workflowMetadata = undefined;
  state.workflowTemplate = undefined;
  state.isWorkflowActive = false;
};
