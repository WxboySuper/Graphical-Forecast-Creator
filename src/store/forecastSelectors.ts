import type { RootState } from './index';

/** Selects the full forecast slice. */
export const selectForecast = (state: RootState) => state.forecast;
/** Selects the active forecast cycle document. */
export const selectForecastCycle = (state: RootState) => state.forecast.forecastCycle;
/** Selects the currently active forecast day number. */
export const selectCurrentDay = (state: RootState) => state.forecast.forecastCycle.currentDay;
/** Selects one day's unsaved discussion draft, if the editor has changed it. */
export const selectDiscussionDraftForScope = (state: RootState, scopeId: string) => state.forecast.discussionDraftsByScope[scopeId];

export {
  selectSavedCycles,
  selectCanUndo,
  selectCanRedo,
  selectIsLowProbability,
  selectCurrentOutlookOpacity,
  selectCompletionValidationResult,
  selectShowCompletionModal,
  selectOmittedDays,
  selectWorkflowMetadata,
  selectIsWorkflowActive,
  selectHasActiveWorkflow,
  selectWorkflowTemplate,
  selectOutlookVersionSnapshots,
  selectCurrentVersionNumber,
  selectAutoCategoricalError,
} from './forecastSliceSelectors';
