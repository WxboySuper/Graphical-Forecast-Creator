import { createSelector } from '@reduxjs/toolkit';
import type { OutlookType } from '../types/outlooks';
import {
  DEFAULT_FORECAST_WORKSPACE,
  getForecastWorkspace,
  type ForecastWorkspaceId,
} from '../config/forecastWorkspaces';
import type { RootState } from './index';
import type { SavedCycle } from './forecastSlice';

export const getSavedCycleWorkspaceId = (cycle: Pick<SavedCycle, 'workspaceId'>): ForecastWorkspaceId =>
  getForecastWorkspace(cycle.workspaceId ?? DEFAULT_FORECAST_WORKSPACE)?.id ?? DEFAULT_FORECAST_WORKSPACE;

export const selectSavedCycles = (state: RootState) => state.forecast.savedCycles ?? [];
/** Selects saved cycles owned by the active workspace, treating legacy records as Severe. */
const selectActiveWorkspaceId = (state: RootState) =>
  getForecastWorkspace(state.forecast.workspaceId)?.id ?? DEFAULT_FORECAST_WORKSPACE;
export const selectSavedCyclesForActiveWorkspace = createSelector(
  [selectActiveWorkspaceId, selectSavedCycles],
  (activeWorkspaceId, savedCycles) => savedCycles.filter((cycle) => (
    cycle != null && getSavedCycleWorkspaceId(cycle) === activeWorkspaceId
  )),
);
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
export const selectCompletionValidationResult = (state: RootState) =>
  state.forecast.completionValidation.lastResult;

/** Selects whether the completion modal is visible. */
export const selectShowCompletionModal = (state: RootState) =>
  state.forecast.completionValidation.showCompletionModal;

/** Selects the omitted days map. */
export const selectOmittedDays = (state: RootState) =>
  state.forecast.completionValidation.omittedDays;

/** Selects the workflow metadata for the active cycle. */
export const selectWorkflowMetadata = (state: RootState) =>
  state.forecast.workflowMetadata;

/** Selects whether a forecast workflow is active across app routes. */
export const selectIsWorkflowActive = (state: RootState) =>
  state.forecast.isWorkflowActive;

/** Selects whether the current route should render workflow-specific UI. */
export const selectHasActiveWorkflow = (state: RootState) =>
  state.forecast.isWorkflowActive && Boolean(state.forecast.workflowMetadata);

/** Selects the workflow template metadata. */
export const selectWorkflowTemplate = (state: RootState) =>
  state.forecast.workflowTemplate;

/** Selects the outlook version snapshots for the active cycle. */
export const selectOutlookVersionSnapshots = (state: RootState) =>
  state.forecast.outlookVersionSnapshots;

/** Selects the current version number for the active cycle. */
export const selectCurrentVersionNumber = (state: RootState) => {
  const metadata = state.forecast.workflowMetadata;
  if (!metadata || metadata.outlookVersions.length === 0) return 1;
  return Math.max(...metadata.outlookVersions.map(v => v.version));
};

/** Selects the editor-visible auto-categorical derivation error, or null. */
export const selectAutoCategoricalError = (state: RootState): string | null =>
  state.forecast.autoCategoricalError;
