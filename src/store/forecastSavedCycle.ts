import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import { cloneForecastCycle } from '../utils/fileUtils';
import { normalizeForecastCycle } from '../utils/outlookMapCoercion';
import { clearHistory } from './forecastHistory';
import type { ForecastState, SavedCycle } from './forecastSlice';

/** Restores a saved cycle and its workflow metadata for load and resume reducers. */
export const restoreSavedCycle = (state: ForecastState, savedCycle: SavedCycle): void => {
  state.forecastCycle = cloneForecastCycle(normalizeForecastCycle(savedCycle.forecastCycle));
  clearHistory(state);
  state.discussionDraftsByScope = {};
  state.isSaved = true;
  state.outlookVersionSnapshots = [];

  if (savedCycle.workflowMetadata) {
    state.workflowMetadata = savedCycle.workflowMetadata;
    state.workflowTemplate = getWorkflowTemplateById(savedCycle.workflowMetadata.workflowId) || {
      id: savedCycle.workflowMetadata.workflowId,
      label: savedCycle.workflowMetadata.workflowId,
      groupings: [],
    };
    state.isWorkflowActive = true;
    return;
  }

  state.workflowMetadata = undefined;
  state.workflowTemplate = undefined;
  state.isWorkflowActive = false;
};
