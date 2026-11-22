import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import VectorSource from "ol/source/Vector";
import Style from "ol/style/Style";
import type Geometry from "ol/geom/Geometry";
import type { Feature as GeoJsonFeature, Polygon } from "geojson";
import { captureMessage } from "@sentry/react";
import {
  applyCustomFeatureMetadata,
  applyForecastFeatureMetadata,
  createFeatureApplier,
  reconcileForecastSource,
} from "./openLayersForecastReconciliation";
import type { FeatureSyncDescriptor } from "./openLayersFeatureSync";

jest.mock("@sentry/react", () => ({
  captureMessage: jest.fn(),
}));

const mockedCaptureMessage = captureMessage as unknown as jest.Mock;

const createPolygonFeature = (id: string): GeoJsonFeature<Polygon> => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [[
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]],
  },
  properties: { outlookType: "tornado", probability: "2%" },
});

const createInvalidDescriptor = (
  feature: GeoJsonFeature<Polygon>,
  format: GeoJSON,
): FeatureSyncDescriptor => ({
  key: `normal:${String(feature.id)}`,
  feature,
  stableId: String(feature.id),
  signature: "invalid",
  read: () => format.readFeature(
    { ...feature, geometry: { type: "Polygon", coordinates: [] } },
    { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" },
  ),
  apply: () => {},
});

describe("reconcileForecastSource", () => {
  beforeEach(() => {
    mockedCaptureMessage.mockClear();
  });

  test.each(["forecast", "categorical", "ghost"])(
    "reports invalid geometry with the %s source tag",
    (sourceName) => {
      const source = new VectorSource();
      const format = new GeoJSON();
      const feature = createPolygonFeature("bad-geometry");

      reconcileForecastSource(
        source,
        [createInvalidDescriptor(feature, format)],
        sourceName,
      );

      expect(source.getFeatures()).toHaveLength(0);
      expect(mockedCaptureMessage).toHaveBeenCalledTimes(1);
      expect(mockedCaptureMessage).toHaveBeenCalledWith(
        "Forecast map skipped invalid geometry",
        {
          level: "warning",
          tags: { source: sourceName, reason: "invalid-geometry" },
        },
      );
    },
  );

  test("stays silent when every descriptor renders", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const feature = createPolygonFeature("good-geometry");
    const descriptor: FeatureSyncDescriptor = {
      key: "normal:good-geometry",
      feature,
      stableId: "good-geometry",
      signature: "tornado|2%",
      read: () => format.readFeature(feature, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      }),
      apply: () => {},
    };

    reconcileForecastSource(source, [descriptor], "forecast");

    expect(source.getFeatures()).toHaveLength(1);
    expect(mockedCaptureMessage).not.toHaveBeenCalled();
  });
});

describe("applyForecastFeatureMetadata", () => {
  test("writes identity and outlook fields to the feature", () => {
    const item = new Feature<Geometry>();
    const derivedFrom = { source: "paint-bucket" };

    applyForecastFeatureMetadata(item, {
      featureId: "feature-1",
      outlookType: "tornado",
      probability: "10%",
      isSignificant: true,
      derivedFrom,
    });

    expect(item.get("featureId")).toBe("feature-1");
    expect(item.get("outlookType")).toBe("tornado");
    expect(item.get("probability")).toBe("10%");
    expect(item.get("isSignificant")).toBe(true);
    expect(item.get("derivedFrom")).toBe(derivedFrom);
  });
});

describe("applyCustomFeatureMetadata", () => {
  test("writes custom layer identity fields to the feature", () => {
    const item = new Feature<Geometry>();

    applyCustomFeatureMetadata(item, {
      featureId: "custom-1",
      customLayerId: "layer-1",
      customLayerTitle: "Layer One",
      categoryId: "category-1",
      title: "Category One",
    });

    expect(item.get("featureId")).toBe("custom-1");
    expect(item.get("customLayerId")).toBe("layer-1");
    expect(item.get("customLayerTitle")).toBe("Layer One");
    expect(item.get("categoryId")).toBe("category-1");
    expect(item.get("title")).toBe("Category One");
  });
});

describe("createFeatureApplier", () => {
  test("builds a fresh style for every applied feature", () => {
    const createStyle = jest.fn(() => new Style());
    const metadata = { featureId: "feature-1" };
    const applyMetadata = jest.fn();
    const apply = createFeatureApplier(createStyle, applyMetadata, metadata);
    const first = new Feature<Geometry>();
    const second = new Feature<Geometry>();

    expect(createStyle).not.toHaveBeenCalled();

    apply(first);
    apply(second);

    expect(createStyle).toHaveBeenCalledTimes(2);
    expect(first.getStyle()).toBeInstanceOf(Style);
    expect(second.getStyle()).toBeInstanceOf(Style);
    expect(first.getStyle()).not.toBe(second.getStyle());
    expect(applyMetadata).toHaveBeenNthCalledWith(1, first, metadata);
    expect(applyMetadata).toHaveBeenNthCalledWith(2, second, metadata);
  });
});
