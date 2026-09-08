/**
 * Blank forecast-cycle state factory.
 *
 * This module creates the canonical empty forecast state used for new cycles and resets. Redux orchestration and UI prompts are handled by callers.
 */
import type { WorkflowMetadata } from '../types/workflow';
import type { DayType } from '../types/outlooks';
import { clearHistory } from './forecastHistory';
import { createEmptyOutlook } from './forecastStateFactory';
import type { ForecastState } from './forecastSlice';

interface StartBlankForecastCycleOptions {
  workflowTemplate?: WorkflowMetadata;
  cycleDate?: string;
  today: string;
  timestamp: string;
}

/** Resolves the first forecast day implied by a workflow template. */
const getWorkflowStartDay = (template?: WorkflowMetadata): DayType => {
  const firstGrouping = template?.groupings[0];
  if (firstGrouping === 'day2') return 2;
  if (firstGrouping === 'day3') return 3;
  if (firstGrouping === 'day4-8') return 4;
  return 1;
};

/** Starts a blank forecast cycle and initializes or clears its workflow metadata. */
export const startBlankForecastCycle = (
  state: ForecastState,
  { workflowTemplate, cycleDate, today, timestamp }: StartBlankForecastCycleOptions,
): void => {
  clearHistory(state);
  state.discussionDraftsByScope = {};
  const effectiveDate = cycleDate || today;
  const startDay = getWorkflowStartDay(workflowTemplate);
  state.forecastCycle = {
    days: { [startDay]: createEmptyOutlook(startDay, timestamp) },
    currentDay: startDay,
    cycleDate: effectiveDate,
  };
  state.isSaved = false;
  state.outlookVersionSnapshots = [];

  if (workflowTemplate) {
    state.workflowTemplate = workflowTemplate;
    state.workflowMetadata = {
      id: `WF-${workflowTemplate.id}-${effectiveDate}`,
      workflowId: workflowTemplate.id,
      cycleDate: effectiveDate,
      status: 'in-progress',
      outlookVersions: [{ version: 1, status: 'in-progress', createdAt: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.isWorkflowActive = true;
    return;
  }

  state.workflowTemplate = undefined;
  state.workflowMetadata = undefined;
  state.isWorkflowActive = false;
};
