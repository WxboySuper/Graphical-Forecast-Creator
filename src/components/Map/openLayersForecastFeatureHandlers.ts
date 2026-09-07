import { captureException } from "@sentry/react";
import GeoJSON from "ol/format/GeoJSON";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type { Feature as GeoJsonFeature } from "geojson";
import { toUpdatedCustomFeature, toUpdatedGeoJsonFeature } from "./openLayersMapStyles";
import { updateCustomFeature, updateFeature } from "../../store/forecastSlice";
import type { DayType } from "../../types/outlooks";

type FeatureAction = ReturnType<typeof updateFeature> | ReturnType<typeof updateCustomFeature>;

export interface ModifiedFeatureHandlerOptions {
  currentDay: DayType;
  dispatch: (action: FeatureAction) => unknown;
  trimStoredOutlookFeature: (feature: GeoJsonFeature) => Promise<GeoJsonFeature>;
}

/** Converts edited OpenLayers features and sends the resulting forecast updates to Redux. */
export const handleModifiedFeatures = (
  features: OLFeature<Geometry>[],
  isCategorical: boolean,
  { currentDay, dispatch, trimStoredOutlookFeature }: ModifiedFeatureHandlerOptions,
): void => {
  const format = new GeoJSON();
  features.forEach((feature) => {
    (async () => {
      try {
        if (isCategorical && feature.get("derivedFrom") === "auto-generated") return;

        if (!isCategorical) {
          const customFeature = toUpdatedCustomFeature(feature, format);
          if (customFeature) {
            dispatch(updateCustomFeature(customFeature));
            return;
          }
        }

        const updatedFeature = toUpdatedGeoJsonFeature(feature, format, isCategorical);
        if (!updatedFeature) return;

        const trimmedFeature = await trimStoredOutlookFeature(updatedFeature);
        dispatch(updateFeature({ feature: trimmedFeature, day: currentDay }));
      } catch (error) {
        captureException(error, { tags: { featureOperation: "modify-outlook" } });
      }
    })();
  });
};
