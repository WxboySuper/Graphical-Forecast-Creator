/**
 * Forecast Redux selectors.
 *
 * This module exposes derived reads from forecast state for pages and components. State mutation belongs to forecast reducers and side effects belong to hooks or services.
 */
import type { OutlookType } from '../types/outlooks';
import type { RootState } from './index';

/** Selects the full forecast slice. */
export const selectForecast = (state: RootState) => state.forecast;
/** Selects the active forecast cycle document. */
export const selectForecastCycle = (state: RootState) => state.forecast.forecastCycle;
/** Selects the currently active forecast day number. */
export const selectCurrentDay = (state: RootState) => state.forecast.forecastCycle.currentDay;
/** Selects one day's unsaved discussion draft, if the editor has changed it. */
export const selectDiscussionDraftForScope = (state: RootState, scopeId: string) => state.forecast.discussionDraftsByScope[scopeId];
/** Selects the saved forecast cycle snapshots shown in cycle history. */
export const selectSavedCycles = (state: RootState) => state.forecast.savedCycles;
/** Returns whether there is at least one reversible edit available. */
export const selectCanUndo = (state: RootState) => {
  const dayHistory = state.forecast.historyByDay[state.forecast.forecastCycle.currentDay];
  return (dayHistory?.undoStack?.length ?? 0) > 0;
};
/** Returns whether there is at least one redo entry available. */
export const selectCanRedo = (state: RootState) => {
  const dayHistory = state.forecast.historyByDay[state.forecast.forecastCycle.currentDay];
  return (dayHistory?.redoStack?.length ?? 0) > 0;
};
/** Returns whether the active outlook type is currently marked as low probability. */
export const selectIsLowProbability = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  const day = cycle.days[cycle.currentDay];
  const activeType = state.forecast.drawingState.activeOutlookType;
  return day?.metadata?.lowProbabilityOutlooks?.includes(activeType) || false;
};
/** Selects the clamped display opacity for one active-day outlook type. */
export const selectCurrentOutlookOpacity = (state: RootState, outlookType: OutlookType): number => {
  const day = state.forecast.forecastCycle.days[state.forecast.forecastCycle.currentDay];
  const value = day?.metadata.outlookOpacities?.[outlookType];
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
};
/** Selects the last completion validation result. */
export const selectCompletionValidationResult = (state: RootState) => state.forecast.completionValidation.lastResult;
/** Selects whether the completion modal is visible. */
export const selectShowCompletionModal = (state: RootState) => state.forecast.completionValidation.showCompletionModal;
/** Selects the omitted days map. */
export const selectOmittedDays = (state: RootState) => state.forecast.completionValidation.omittedDays;
/** Selects the workflow metadata for the active cycle. */
export const selectWorkflowMetadata = (state: RootState) => state.forecast.workflowMetadata;
/** Selects whether a forecast workflow is active across app routes. */
export const selectIsWorkflowActive = (state: RootState) => state.forecast.isWorkflowActive;
/** Selects whether the current route should render workflow-specific UI. */
export const selectHasActiveWorkflow = (state: RootState) =>
  state.forecast.isWorkflowActive && Boolean(state.forecast.workflowMetadata);
/** Selects the workflow template metadata. */
export const selectWorkflowTemplate = (state: RootState) => state.forecast.workflowTemplate;
/** Selects the outlook version snapshots for the active cycle. */
export const selectOutlookVersionSnapshots = (state: RootState) => state.forecast.outlookVersionSnapshots;
/** Selects the current version number for the active cycle. */
export const selectCurrentVersionNumber = (state: RootState) => {
  const metadata = state.forecast.workflowMetadata;
  if (!metadata || metadata.outlookVersions.length === 0) return 1;
  return Math.max(...metadata.outlookVersions.map((version) => version.version));
};
/** Selects the editor-visible auto-categorical derivation error, or null. */
export const selectAutoCategoricalError = (state: RootState): string | null => state.forecast.autoCategoricalError;
