import type { ForecastState } from './forecastSlice';
import type { StandardGrouping } from '../types/workflow';
import { validateCycleCompletion } from '../utils/completionValidation';

/** Runs completion validation and opens the completion dialog with its result. */
export const applyCompletionValidation = (
  state: ForecastState,
  standardGroupings?: StandardGrouping[],
): void => {
  state.completionValidation.lastResult = validateCycleCompletion(
    state.forecastCycle,
    standardGroupings,
  );
  state.completionValidation.omittedDays = {};
  state.completionValidation.showCompletionModal = true;
};

/** Marks the active cycle complete and clears transient completion state. */
export const applyCompleteCycle = (state: ForecastState, completedAt: string): void => {
  state.forecastCycle.completionAcknowledgedAt = completedAt;
  if (state.workflowMetadata) {
    state.workflowMetadata.status = 'completed';
    state.workflowMetadata.updatedAt = completedAt;
    const currentVersion = state.workflowMetadata.outlookVersions[state.workflowMetadata.outlookVersions.length - 1];
    if (currentVersion?.status === 'in-progress') currentVersion.status = 'completed';
  }
  delete state.forecastCycle.omittedDayReasons;
  delete state.forecastCycle.updateInProgressVersion;
  state.completionValidation.showCompletionModal = false;
  state.completionValidation.lastResult = null;
  state.completionValidation.omittedDays = {};
  state.isSaved = false;
};

/** Marks the active cycle complete while preserving the selected omitted-day reasons. */
export const applyCompleteWithOmissions = (state: ForecastState, completedAt: string): void => {
  state.forecastCycle.completionAcknowledgedAt = completedAt;
  if (state.workflowMetadata) {
    state.workflowMetadata.status = 'completed-with-omissions';
    state.workflowMetadata.updatedAt = completedAt;
    const currentVersion = state.workflowMetadata.outlookVersions[state.workflowMetadata.outlookVersions.length - 1];
    if (currentVersion?.status === 'in-progress') currentVersion.status = 'omitted';
  }
  state.forecastCycle.omittedDayReasons = { ...state.completionValidation.omittedDays };
  delete state.forecastCycle.updateInProgressVersion;
  state.completionValidation.showCompletionModal = false;
  state.completionValidation.lastResult = null;
  state.completionValidation.omittedDays = {};
  state.isSaved = false;
};
