import { captureMessage } from "@sentry/react";
import type VectorSource from "ol/source/Vector";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
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

/** Applies the shared identity and outlook metadata to a rendered feature. */
export const applyForecastFeatureMetadata = (
  item: OLFeature<Geometry>,
  metadata: {
    featureId: string;
    outlookType: string;
    probability: string;
    isSignificant: boolean;
    derivedFrom: unknown;
  },
): void => {
  item.set("featureId", metadata.featureId);
  item.set("outlookType", metadata.outlookType);
  item.set("probability", metadata.probability);
  item.set("isSignificant", metadata.isSignificant);
  item.set("derivedFrom", metadata.derivedFrom);
};

/** Applies custom-layer identity metadata to a rendered custom feature. */
export const applyCustomFeatureMetadata = (
  item: OLFeature<Geometry>,
  metadata: {
    featureId: string;
    customLayerId: string;
    customLayerTitle: string;
    categoryId: string;
    title: string;
  },
): void => {
  item.set("featureId", metadata.featureId);
  item.set("customLayerId", metadata.customLayerId);
  item.set("customLayerTitle", metadata.customLayerTitle);
  item.set("categoryId", metadata.categoryId);
  item.set("title", metadata.title);
};

type FeatureStyle = Parameters<OLFeature<Geometry>["setStyle"]>[0];

/** Builds a descriptor applier that combines an OpenLayers style with metadata. */
export const createFeatureApplier = <Metadata,>(
  style: FeatureStyle,
  applyMetadata: (item: OLFeature<Geometry>, metadata: Metadata) => void,
  metadata: Metadata,
): ((item: OLFeature<Geometry>) => void) => (item) => {
  item.setStyle(style);
  applyMetadata(item, metadata);
};
