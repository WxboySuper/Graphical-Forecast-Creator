/**
 * File: src/components/Map/openLayersForecastPreviews.ts
 * Purpose: Coordinates temporary OpenLayers forecast previews during drawing and editing workflows.
 */

import GeoJSON from "ol/format/GeoJSON";
import type { default as OLFeature, FeatureLike } from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style as OlStyle } from "ol/style";
import type { Feature as GeoJsonFeature } from "geojson";
import { toTstmPreviewOlStyle } from "./openLayersMapStyles";

/** Applies preview styling and metadata before adding one OL feature. */
const addTstmPreviewOlFeature = (
  item: OLFeature<Geometry>,
  previewSource: VectorSource,
  previewStyle: ReturnType<typeof toTstmPreviewOlStyle>,
  featureId: string,
): void => {
  item.setStyle(previewStyle);
  item.set("featureId", featureId);
  item.set("outlookType", "categorical");
  item.set("probability", "TSTM");
  previewSource.addFeature(item);
};

const TRIM_PREVIEW_STYLE = new OlStyle({
  fill: new Fill({ color: "rgba(0, 188, 212, 0.35)" }),
  stroke: new Stroke({ color: "#00acc1", width: 2, lineDash: [8, 4] }),
});

/** Replaces trim-preview features on a dedicated overlay source. */
export const syncTrimPreviewSource = (
  previewSource: VectorSource,
  previewFeatures: GeoJsonFeature[],
): void => {
  previewSource.clear();
  const format = new GeoJSON();

  previewFeatures.forEach((feature) => {
    const olFeature = format.readFeature(feature, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    /** Marks a feature as part of the temporary trim preview. */
    const applyPreview = (item: OLFeature<Geometry>) => {
      item.setStyle(TRIM_PREVIEW_STYLE);
      item.set("trimPreview", true);
    };

    if (Array.isArray(olFeature)) {
      olFeature.forEach((item: FeatureLike) => applyPreview(item as OLFeature<Geometry>));
      previewSource.addFeatures(olFeature as OLFeature<Geometry>[]);
    } else {
      applyPreview(olFeature as OLFeature<Geometry>);
      previewSource.addFeature(olFeature as OLFeature<Geometry>);
    }
  });
};

/** Replaces Auto-TSTM preview features on a dedicated map source. */
export const syncTstmPreviewSource = (
  previewSource: VectorSource,
  tstmPreviewFeatures: GeoJsonFeature[],
): void => {
  previewSource.clear();
  const format = new GeoJSON();
  const previewStyle = toTstmPreviewOlStyle();

  tstmPreviewFeatures.forEach((feature) => {
    const olFeature = format.readFeature(feature, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    const featureId = String(feature.id ?? "tstm-preview");

    if (Array.isArray(olFeature)) {
      olFeature.forEach((item: FeatureLike) =>
        addTstmPreviewOlFeature(item as OLFeature<Geometry>, previewSource, previewStyle, featureId),
      );
    } else {
      addTstmPreviewOlFeature(olFeature as OLFeature<Geometry>, previewSource, previewStyle, featureId);
    }
  });
};
