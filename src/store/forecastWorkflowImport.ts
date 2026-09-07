import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import { clearHistory } from './forecastHistory';
import type { ForecastState } from './forecastSlice';
import type { Package } from '../types/workflow';

/** Applies workflow package metadata and resets transient state after package import. */
export const applyWorkflowPackageImport = (state: ForecastState, pkg: Package): void => {
  if (pkg.cycles.length > 0) {
    state.workflowMetadata = pkg.cycles[0];
    state.isWorkflowActive = true;
  }
  if (pkg.metadata) {
    state.workflowTemplate = getWorkflowTemplateById(pkg.metadata.workflowId) || {
      id: pkg.metadata.workflowId,
      label: pkg.metadata.workflowId,
      groupings: [],
    };
  }
  state.discussionDraftsByScope = {};
  clearHistory(state);
  state.isSaved = true;
  state.outlookVersionSnapshots = [];
};
