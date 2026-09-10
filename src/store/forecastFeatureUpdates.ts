/**
 * Defines forecast feature-update shapes and pure helpers for applying geometry or outlook changes.
 * This module owns feature-update normalization for the forecast store; UI event handling and persistence are outside its boundary.
 */
import type { Feature } from 'geojson';
import type { DayType, OutlookData, OutlookType } from '../types/outlooks';
import type { ForecastState } from './forecastSlice';

export interface PendingFeatureUpdate {
  outlookType: OutlookType;
  probability: string;
  index: number;
  feature: Feature;
}

type EmptyDayFactory = (
  day: DayType,
  timestamp: string,
) => NonNullable<ForecastState['forecastCycle']['days'][DayType]>;

export interface ForecastFeatureUpdateHelpers {
  getCurrentOutlook: (state: ForecastState, dayNumber?: DayType) => OutlookData;
  collectPendingFeatureUpdates: (
    state: ForecastState,
    incoming: Feature[],
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
    if (!day) return createEmptyDay(dayNumber, initialTimestamp).data;
    return day.data;
  };

  /** Finds incoming features that already exist in the selected day's outlook maps. */
  const collectPendingFeatureUpdates = (
    state: ForecastState,
    incoming: Feature[],
    day?: DayType,
  ): PendingFeatureUpdate[] => {
    const outlookData = getCurrentOutlook(state, day);

    return incoming.flatMap((feature) => {
      const outlookType = (feature.properties?.outlookType as OutlookType)
        || state.drawingState.activeOutlookType;
      const probability = (feature.properties?.probability as string)
        || state.drawingState.activeProbability;
      const features = outlookData[outlookType]?.get(probability);
      if (!features) return [];

      const index = features.findIndex((entry) => entry.id === feature.id);
      return index === -1 ? [] : [{ outlookType, probability, index, feature }];
    });
  };

  /** Applies pending geometry and property updates in place, removing null geometries. */
  // @codescene(disable:"Bumpy Road Ahead")
  const applyPendingFeatureUpdates = (
    state: ForecastState,
    pendingUpdates: PendingFeatureUpdate[],
    day?: DayType,
  ): void => {
    const outlookData = getCurrentOutlook(state, day);

    for (const update of pendingUpdates) {
      const features = outlookData[update.outlookType]?.get(update.probability);
      if (!features) continue;

      if (update.feature.geometry === null) {
        features.splice(update.index, 1);
        if (features.length === 0) outlookData[update.outlookType]?.delete(update.probability);
        continue;
      }

      features[update.index] = {
        ...features[update.index],
        geometry: update.feature.geometry,
        properties: {
          ...features[update.index].properties,
          ...update.feature.properties,
        },
      };
    }
  };

  return { getCurrentOutlook, collectPendingFeatureUpdates, applyPendingFeatureUpdates };
};
