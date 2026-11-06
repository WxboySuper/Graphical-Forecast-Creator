/**
 * Forecast-feature normalization: this module converts drawn GeoJSON features
 * into the canonical hazard and outlook shapes consumed by the forecast store.
 * It owns pure normalization and metadata cleanup, not map editing, storage, or
 * Redux orchestration.
 */
import type { Feature } from "geojson";

import type { DrawingState, OutlookType } from "../types/outlooks";

type FeatureNormalizationState = {
  drawingState: Pick<DrawingState, "activeOutlookType" | "activeProbability">;
};

/** Resolves a feature outlook type, falling back to the active drawing state. */
export const computeOutlookType = (
  feature: Feature,
  state: FeatureNormalizationState,
): OutlookType => (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;

/** Normalizes a feature probability while preserving categorical and CIG labels. */
export const computeProbability = (
  feature: Feature,
  state: FeatureNormalizationState,
): string => {
  const fallback = state.drawingState.activeProbability;
  const base = (feature.properties?.probability ?? fallback) as string;
  const outlookType = (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;

  if (outlookType === "categorical" || String(base).startsWith("CIG")) {
    return base;
  }

  const normalized = String(base).replace(/[%#]/g, "");
  return `${normalized}%`;
};

/** Adds the editor metadata required for a feature to enter forecast state. */
export const buildFeatureWithProps = (
  feature: Feature,
  outlookType: OutlookType,
  probability: string,
  isSignificant: boolean,
): Feature => ({
  ...feature,
  properties: {
    ...feature.properties,
    outlookType,
    probability,
    isSignificant,
    derivedFrom: feature.properties?.derivedFrom || outlookType,
    originalProbability: feature.properties?.originalProbability || probability,
  },
} as Feature);
