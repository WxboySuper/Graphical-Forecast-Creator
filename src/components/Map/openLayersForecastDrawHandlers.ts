import { captureException } from "@sentry/react";
import GeoJSON from "ol/format/GeoJSON";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type { Feature as GeoJsonFeature, GeoJsonProperties, MultiPolygon, Polygon } from "geojson";
import { v4 as uuidv4 } from "uuid";
import { addCustomFeature, addFeature } from "../../store/forecastSlice";
import type { DayType } from "../../types/outlooks";
import type { CustomCategoryTemplate, OneOffCustomLayer } from "../../types/customProducts";
import type { LandMaskStrategy } from "../../utils/outlookPolygonMasking/types";
import { toDrawnCustomFeature } from "./openLayersMapStyles";

export interface DrawnFeatureHandlerOptions {
  currentDay: DayType;
  activeOutlookType: string;
  activeProbability: string;
  isSignificant: boolean;
  customMode: boolean;
  activeCustomLayer: OneOffCustomLayer | undefined;
  activeCustomCategory: CustomCategoryTemplate | undefined;
  trimGeometryForAutoDraw: (
    geometry: Polygon | MultiPolygon,
    strategy: LandMaskStrategy,
    autoOnDraw: boolean,
    previewOnly: boolean,
  ) => Promise<Polygon | MultiPolygon | null>;
  trimStrategy: LandMaskStrategy;
  trimAutoOnDraw: boolean;
  trimPreviewOnly: boolean;
  dispatch: (action: ReturnType<typeof addFeature> | ReturnType<typeof addCustomFeature>) => unknown;
}

/** Persists a completed OpenLayers polygon as a custom or regular forecast feature. */
export const handleForecastDrawEnd = (
  event: { feature: OLFeature<Geometry> },
  options: DrawnFeatureHandlerOptions,
): void => {
  const format = new GeoJSON();
  const geometry = event.feature.getGeometry();
  if (!geometry) return;

  void (async () => {
    try {
      const geometryObject = format.writeGeometryObject(geometry, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });
      const customFeature = toDrawnCustomFeature(
        geometry,
        options.activeCustomLayer,
        options.activeCustomCategory,
        options.customMode,
      );
      if (customFeature) {
        options.dispatch(addCustomFeature(customFeature));
        return;
      }

      let outlookGeometry: Polygon | MultiPolygon | null = geometryObject as Polygon | MultiPolygon;
      outlookGeometry = await options.trimGeometryForAutoDraw(
        outlookGeometry,
        options.trimStrategy,
        options.trimAutoOnDraw,
        options.trimPreviewOnly,
      );
      if (!outlookGeometry) return;
      const feature: GeoJsonFeature<Polygon | MultiPolygon, GeoJsonProperties> = {
        type: "Feature",
        id: uuidv4(),
        geometry: outlookGeometry,
        properties: {
          outlookType: options.activeOutlookType,
          probability: options.activeProbability,
          isSignificant: options.isSignificant,
        },
      };
      options.dispatch(addFeature({ feature, day: options.currentDay }));
    } catch (error) {
      captureException(error, { tags: { featureOperation: "draw-outlook" } });
    }
  })();
};
