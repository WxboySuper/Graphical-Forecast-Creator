import { captureMessage } from "@sentry/react";
import type VectorSource from "ol/source/Vector";
import { reconcileFeatureSource, type FeatureSyncDescriptor, type FeatureSyncStats } from "./openLayersFeatureSync";

/** Reconciles a forecast source and reports skipped invalid geometry with its source name. */
export const reconcileForecastSource = (
  targetSource: VectorSource,
  descriptors: FeatureSyncDescriptor[],
  sourceName: string,
): void => {
  const stats: FeatureSyncStats = {
    parsed: 0,
    added: 0,
    updated: 0,
    removed: 0,
    reused: 0,
    skipped: 0,
  };
  reconcileFeatureSource(targetSource, descriptors, stats);
  if (stats.skipped > 0) {
    captureMessage("Forecast map skipped invalid geometry", {
      level: "warning",
      tags: { source: sourceName, reason: "invalid-geometry" },
    });
  }
};
