import type { ForecastState } from './forecastSlice';
import { invalidateCompletionAcknowledgement } from './forecastProbabilityState';
import { pushUndoSnapshot } from './forecastHistory';
import {
  copyOutlookGeometry,
  countCopyableSourceFeatures,
  type CopyOutlookGeometryOptions,
} from '../utils/outlookGeometryCopy';

/** Copies compatible outlook geometry between hazards in the active forecast day. */
export const applyCopyOutlookGeometryBetweenHazards = (
  state: ForecastState,
  options: CopyOutlookGeometryOptions,
  timestamp: string,
): void => {
  const day = state.forecastCycle.currentDay;
  if (day !== 1 && day !== 2) return;

  const { sourceType, targetType } = options;
  if (sourceType === targetType) return;

  const dayData = state.forecastCycle.days[day];
  if (!dayData) return;

  const sourceMap = dayData.data[sourceType];
  const targetMap = dayData.data[targetType];
  if (!sourceMap || !targetMap) return;

  const copyableCount = countCopyableSourceFeatures({
    sourceMap,
    sourceType,
    targetType,
    day,
    probabilityFilter: options.probabilityFilter,
  });
  if (copyableCount === 0) return;

  pushUndoSnapshot(state);
  copyOutlookGeometry(sourceMap, targetMap, options, day);

  if (dayData.metadata.lowProbabilityOutlooks) {
    dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
      (type) => type !== targetType,
    );
  }

  dayData.metadata.lastModified = timestamp;
  invalidateCompletionAcknowledgement(state);
  state.isSaved = false;
};
