import GeoJSON from "ol/format/GeoJSON";
import type { default as OLFeature } from "ol/Feature";
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

// One shared style instance is intentional. Trim previews are temporary and
// never mutate this style, so reusing it avoids allocating per feature.
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
    // readFeature returns a single feature. Polygon and MultiPolygon inputs
    // both arrive as one OL feature with the matching geometry type.
    const olFeature = format.readFeature(feature, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    }) as OLFeature<Geometry>;

    olFeature.setStyle(TRIM_PREVIEW_STYLE);
    olFeature.set("trimPreview", true);
    previewSource.addFeature(olFeature);
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
    // readFeature returns a single feature. Polygon and MultiPolygon inputs
    // both arrive as one OL feature with the matching geometry type.
    const olFeature = format.readFeature(feature, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    }) as OLFeature<Geometry>;
    const featureId = String(feature.id ?? "tstm-preview");

    addTstmPreviewOlFeature(olFeature, previewSource, previewStyle, featureId);
  });
};
