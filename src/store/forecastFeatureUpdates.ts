import type { Feature, Geometry } from 'geojson';
import type { DayType, OutlookData, OutlookType } from '../types/outlooks';
import type { ForecastState } from './forecastSlice';

export interface PendingFeatureUpdate {
  outlookType: OutlookType;
  probability: string;
  feature: Feature<Geometry | null>;
}

type UpdatableFeature = Feature<Geometry | null>;

type EmptyDayFactory = (
  day: DayType,
  timestamp: string,
) => NonNullable<ForecastState['forecastCycle']['days'][DayType]>;

export interface ForecastFeatureUpdateHelpers {
  getCurrentOutlook: (state: ForecastState, dayNumber?: DayType) => OutlookData;
  ensureCurrentOutlook: (state: ForecastState, dayNumber?: DayType, timestamp?: string) => OutlookData;
  collectPendingFeatureUpdates: (
    state: ForecastState,
    incoming: UpdatableFeature[],
    day?: DayType,
  ) => PendingFeatureUpdate[];
  applyPendingFeatureUpdates: (
    state: ForecastState,
    pendingUpdates: PendingFeatureUpdate[],
    day?: DayType,
  ) => void;
}

/** Creates the active-outlook and feature-reconciliation helpers used by forecast reducers. */
export const createForecastFeatureUpdateHelpers = (
  createEmptyDay: EmptyDayFactory,
  initialTimestamp: string,
): ForecastFeatureUpdateHelpers => {
  /** Returns the selected day's outlook data, falling back to an empty day shape. */
  const getCurrentOutlook = (
    state: ForecastState,
    dayNumber = state.forecastCycle.currentDay,
  ): OutlookData => {
    const day = state.forecastCycle.days[dayNumber];
    if (day) return day.data;

    return createEmptyDay(dayNumber, initialTimestamp).data;
  };

  /** Creates the selected day only for reducers that have confirmed a real edit. */
  const ensureCurrentOutlook = (
    state: ForecastState,
    dayNumber = state.forecastCycle.currentDay,
    timestamp = initialTimestamp,
  ): OutlookData => {
    let day = state.forecastCycle.days[dayNumber];
    if (!day) {
      day = createEmptyDay(dayNumber, timestamp);
      state.forecastCycle.days[dayNumber] = day;
    }
    return day.data;
  };

  const collectPendingFeatureUpdate = (
    state: ForecastState,
    outlookData: OutlookData,
    feature: UpdatableFeature,
  ): PendingFeatureUpdate[] => {
    const outlookType = (feature.properties?.outlookType as OutlookType)
      || state.drawingState.activeOutlookType;
    const probability = (feature.properties?.probability as string)
      || state.drawingState.activeProbability;
    const features = outlookData[outlookType]?.get(probability);
    if (!features) return [];

    return features.some((entry) => entry.id === feature.id)
      ? [{ outlookType, probability, feature }]
      : [];
  };

  /** Finds incoming features that already exist in the selected day's outlook maps. */
  const collectPendingFeatureUpdates = (
    state: ForecastState,
    incoming: UpdatableFeature[],
    day?: DayType,
  ): PendingFeatureUpdate[] => {
    const outlookData = state.forecastCycle.days[day ?? state.forecastCycle.currentDay]?.data;
    if (!outlookData) return [];

    return incoming.flatMap((feature) =>
      collectPendingFeatureUpdate(state, outlookData, feature));
  };

  /** Applies one update to the current feature matching its stable ID. */
  const applyPendingFeatureUpdate = (
    outlookData: OutlookData,
    update: PendingFeatureUpdate,
  ): void => {
    const features = outlookData[update.outlookType]?.get(update.probability);
    if (!features) return;

    const liveIndex = features.findIndex((entry) => entry.id === update.feature.id);
    if (liveIndex === -1) return;

    if (update.feature.geometry === null) {
      features.splice(liveIndex, 1);
      if (features.length === 0) outlookData[update.outlookType]?.delete(update.probability);
      return;
    }

    const currentFeature = features[liveIndex];
    if (!currentFeature) return;
    features[liveIndex] = {
      ...currentFeature,
      geometry: update.feature.geometry,
      properties: {
        ...currentFeature.properties,
        ...update.feature.properties,
      },
    };
  };

  /** Applies pending geometry and property updates in place, removing null geometries. */
  const applyPendingFeatureUpdates = (
    state: ForecastState,
    pendingUpdates: PendingFeatureUpdate[],
    day?: DayType,
  ): void => {
    const outlookData = state.forecastCycle.days[day ?? state.forecastCycle.currentDay]?.data;
    if (!outlookData) return;
    pendingUpdates.forEach((update) => applyPendingFeatureUpdate(outlookData, update));
  };

  return {
    getCurrentOutlook,
    ensureCurrentOutlook,
    collectPendingFeatureUpdates,
    applyPendingFeatureUpdates,
  };
};
