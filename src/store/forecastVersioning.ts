import type { ForecastState } from './forecastSlice';
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
  (Object.entries(state.forecastCycle.days) as [string, typeof state.forecastCycle.days[keyof typeof state.forecastCycle.days]][]).forEach(
    ([day, dayData]) => {
      if (!dayData) return;
      snapshotDays[day as unknown as keyof typeof snapshotDays] = {
        ...dayData,
        data: cloneOutlookData(dayData.data),
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
