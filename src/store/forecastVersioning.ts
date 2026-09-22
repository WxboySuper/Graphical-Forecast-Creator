import type { ForecastState } from './forecastSlice';
import type { DayType } from '../types/outlooks';
import { cloneIntegratedCustomLayers, cloneOutlookData } from './forecastSnapshotHelpers';
import { invalidateCompletionAcknowledgement } from './forecastProbabilityState';

/** Creates a new same-cycle outlook version and snapshots the previous version. */
export const applyCreateOutlookUpdate = (state: ForecastState, now: string): void => {
  const currentVersions = state.workflowMetadata?.outlookVersions ?? [];
  const nextVersion = currentVersions.length > 0
    ? Math.max(...currentVersions.map((version) => version.version)) + 1
    : 1;

  const snapshotDays: typeof state.forecastCycle.days = {};
  let hasSnapshot = false;
  // Snapshot every day that has data so full-outlook workflows keep
  // the whole version side-by-side with the next iteration, not just
  // the currently selected day.
  (Object.entries(state.forecastCycle.days) as unknown as [DayType, typeof state.forecastCycle.days[DayType]][]).forEach(
    ([day, dayData]) => {
      if (!dayData) return;
      snapshotDays[day] = {
        ...dayData,
        data: cloneOutlookData(dayData.data),
        // Version history must retain the exact geometry and appearance
        // that existed before the update, not a live reference.
        customLayers: cloneIntegratedCustomLayers(dayData.customLayers),
      };
      hasSnapshot = true;
    },
  );

  if (hasSnapshot) {
    state.outlookVersionSnapshots.push({
      version: nextVersion - 1,
      days: snapshotDays,
      createdAt: now,
    });
  }

  if (state.workflowMetadata) {
    state.workflowMetadata.outlookVersions.forEach((version) => {
      if (version.status === 'in-progress') version.status = 'completed';
    });
    state.workflowMetadata.outlookVersions.push({
      version: nextVersion,
      status: 'in-progress',
      derivedFrom: nextVersion - 1,
      createdAt: now,
    });
    state.workflowMetadata.status = 'in-progress';
    state.workflowMetadata.updatedAt = now;
  }

  state.forecastCycle.updateInProgressVersion = nextVersion;
  invalidateCompletionAcknowledgement(state);
  state.isSaved = false;
};
