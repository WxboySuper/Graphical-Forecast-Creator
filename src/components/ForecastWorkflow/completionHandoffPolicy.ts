import type { CycleMetadata, WorkflowMetadata } from '../../types/workflow';

export interface CompletionHandoffEligibility { showHandoff: boolean; showMonitor: boolean; }

const MONITOR_SUPPORTED_GROUPINGS = new Set(['day1']);
const COMPLETED_STATUSES = new Set(['completed', 'completed-with-omissions']);

/** Returns the post-completion actions allowed for a known workflow shape. */
export const getCompletionHandoffEligibility = (
  workflow: WorkflowMetadata | undefined,
  cycle: CycleMetadata | undefined,
): CompletionHandoffEligibility => {
  if (!workflow || !cycle || !COMPLETED_STATUSES.has(cycle.status)) {
    return { showHandoff: false, showMonitor: false };
  }
  const groupings = workflow.groupings;
  const isKnownShortTermWorkflow = groupings.length > 0 && groupings.every(
    (grouping) => grouping === 'day1' || grouping === 'day2' || grouping === 'day3',
  );
  return {
    showHandoff: isKnownShortTermWorkflow,
    showMonitor: isKnownShortTermWorkflow && groupings.some((grouping) => MONITOR_SUPPORTED_GROUPINGS.has(grouping)),
  };
};

/** Stable identity used to suppress a handoff only for one completion revision. */
export const getCompletionHandoffIdentity = (cycle: CycleMetadata): string => {
  const version = cycle.outlookVersions.reduce((highest, item) => Math.max(highest, item.version), 1);
  return `${cycle.id}:${cycle.workflowId}:${version}:${cycle.updatedAt}`;
};

export const COMPLETION_HANDOFF_STORAGE_KEY = 'gfc-completion-handoff-handled';

export const hasHandledCompletionHandoff = (identity: string): boolean => {
  try { return sessionStorage.getItem(`${COMPLETION_HANDOFF_STORAGE_KEY}:${identity}`) === 'true'; } catch { return false; }
};

export const markCompletionHandoffHandled = (identity: string): void => {
  try { sessionStorage.setItem(`${COMPLETION_HANDOFF_STORAGE_KEY}:${identity}`, 'true'); } catch { /* best effort */ }
};
