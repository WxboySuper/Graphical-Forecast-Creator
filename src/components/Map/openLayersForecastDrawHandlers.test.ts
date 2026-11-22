import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import Point from "ol/geom/Point";
import type Geometry from "ol/geom/Geometry";
import type { MultiPolygon as GeoJsonMultiPolygon, Polygon as GeoJsonPolygon } from "geojson";
import { captureException } from "@sentry/react";
import {
  CUSTOM_PRODUCTS_SCHEMA_VERSION,
  type CustomCategoryId,
  type CustomCategoryTemplate,
  type CustomPolygonFeature,
  type OneOffCustomLayer,
} from "../../types/customProducts";
import { asCustomLayerId } from "../../lib/customProducts";
import { addCustomFeature } from "../../store/forecastSlice";
import { handleForecastDrawEnd, type DrawnFeatureHandlerOptions } from "./openLayersForecastDrawHandlers";

jest.mock("@sentry/react", () => ({ captureException: jest.fn() }));

const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

const polygonFeature = () => new Feature({
  geometry: new Polygon([[[0, 0], [10, 0], [10, 10], [0, 0]]]),
});

const pointFeature = () => new Feature({
  geometry: new Point([0, 0]),
});

const customCategory: CustomCategoryTemplate = {
  id: "cat-1" as CustomCategoryId,
  label: "Heavy snow",
  order: 0,
  style: {
    fillColor: "#22c55e",
    fillOpacity: 0.5,
    strokeColor: "#111827",
    strokeOpacity: 1,
    strokeWidth: 2,
    hatch: "none",
  },
};

const customLayer: OneOffCustomLayer = {
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  id: asCustomLayerId("layer-1"),
  label: "Winter impacts",
  order: 0,
  categories: [customCategory],
  features: [],
  createdAt: "2026-07-17T12:00:00.000Z",
  updatedAt: "2026-07-17T12:00:00.000Z",
};

type DrawOptions = DrawnFeatureHandlerOptions;

const baseOptions = (overrides: Partial<DrawOptions> = {}): DrawOptions & {
  dispatch: jest.Mock;
  trimGeometryForAutoDraw: jest.Mock;
} => {
  const dispatch = jest.fn();
  const trimGeometryForAutoDraw = jest.fn(async (geometry: GeoJsonPolygon | GeoJsonMultiPolygon) => geometry);
  return {
    currentDay: 1,
    activeOutlookType: "tornado",
    activeProbability: "2%",
    isSignificant: false,
    customMode: false,
    activeCustomLayer: undefined,
    activeCustomCategory: undefined,
    trimGeometryForAutoDraw,
    trimStrategy: "us-states-union",
    trimAutoOnDraw: true,
    trimPreviewOnly: false,
    dispatch,
    ...overrides,
    } as DrawOptions & { dispatch: jest.Mock; trimGeometryForAutoDraw: jest.Mock };
};

const polygonRing: number[][][] = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];

describe("handleForecastDrawEnd", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("trims a drawn polygon and dispatches it for the current day", async () => {
    const options = baseOptions({ currentDay: 2 });
    const trimmed: GeoJsonPolygon = {
      type: "Polygon",
      coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, -1]]],
    };
    options.trimGeometryForAutoDraw.mockResolvedValue(trimmed);

    handleForecastDrawEnd({ feature: polygonFeature() as Feature<Geometry> }, options);
    await flush();

    expect(options.trimGeometryForAutoDraw).toHaveBeenCalledTimes(1);
    expect(options.dispatch).toHaveBeenCalledTimes(1);
    const action = options.dispatch.mock.calls[0][0] as { payload: { day: number; feature: { geometry: unknown; properties: Record<string, unknown> } } };
    expect(action.payload.day).toBe(2);
    expect(action.payload.feature.geometry).toBe(trimmed);
    expect(action.payload.feature.properties).toMatchObject({
      outlookType: "tornado",
      probability: "2%",
      isSignificant: false,
    });
  });

  test("rejects non-polygon geometry without trimming or dispatching", async () => {
    const options = baseOptions();
    handleForecastDrawEnd({ feature: pointFeature() as Feature<Geometry> }, options);
    await flush();

    expect(options.trimGeometryForAutoDraw).not.toHaveBeenCalled();
    expect(options.dispatch).not.toHaveBeenCalled();
  });

  test("dispatches a custom feature without running outlook trim", async () => {
    const options = baseOptions({
      customMode: true,
      activeCustomLayer: customLayer,
      activeCustomCategory: customCategory,
    });
    const drawn = polygonFeature() as Feature<Geometry>;
    const expectedGeometry = new GeoJSON().writeGeometryObject(drawn.getGeometry()!, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    handleForecastDrawEnd({ feature: drawn }, options);
    await flush();

    expect(options.trimGeometryForAutoDraw).not.toHaveBeenCalled();
    expect(options.dispatch).toHaveBeenCalledTimes(1);
    const action = options.dispatch.mock.calls[0][0] as ReturnType<typeof addCustomFeature>;
    expect(action.type).toBe(addCustomFeature.type);
    const payload = action.payload as CustomPolygonFeature;
    expect(payload.type).toBe("Feature");
    expect(typeof payload.id).toBe("string");
    expect(payload.geometry).toEqual(expectedGeometry);
    expect(payload.geometry.type).toBe("Polygon");
    expect(payload.properties).toMatchObject({
      customLayerId: customLayer.id,
      categoryId: customCategory.id,
      title: customCategory.label,
    });
  });

  test("does nothing when trim removes the geometry", async () => {
    const options = baseOptions();
    options.trimGeometryForAutoDraw.mockResolvedValue(null);
    handleForecastDrawEnd({ feature: polygonFeature() as Feature<Geometry> }, options);
    await flush();

    expect(options.dispatch).not.toHaveBeenCalled();
  });

  test("does nothing when the drawn feature has no geometry", async () => {
    const options = baseOptions();
    handleForecastDrawEnd({ feature: new Feature() as Feature<Geometry> }, options);
    await flush();

    expect(options.trimGeometryForAutoDraw).not.toHaveBeenCalled();
    expect(options.dispatch).not.toHaveBeenCalled();
  });

  test("reports trim failures to Sentry without dispatching", async () => {
    const options = baseOptions();
    options.trimGeometryForAutoDraw.mockRejectedValue(new Error("trim failed"));
    handleForecastDrawEnd({ feature: polygonFeature() as Feature<Geometry> }, options);
    await flush();

    expect(options.dispatch).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  test("dispatches a custom feature for MultiPolygon draws in custom mode", async () => {
    const options = baseOptions({
      customMode: true,
      activeCustomLayer: customLayer,
      activeCustomCategory: customCategory,
    });
    const feature = new Feature<Geometry>({ geometry: new MultiPolygon([polygonRing]) });

    handleForecastDrawEnd({ feature }, options);
    await flush();

    expect(options.dispatch).toHaveBeenCalledTimes(1);
    const action = options.dispatch.mock.calls[0][0] as { payload: { geometry: { type: string } } };
    expect(action.payload.geometry.type).toBe("MultiPolygon");
    expect(options.trimGeometryForAutoDraw).not.toHaveBeenCalled();
  });

  test("dispatches an outlook feature for MultiPolygon draws in forecast mode", async () => {
    const options = baseOptions();
    const feature = new Feature<Geometry>({ geometry: new MultiPolygon([polygonRing]) });

    handleForecastDrawEnd({ feature }, options);
    await flush();

    expect(options.dispatch).toHaveBeenCalledTimes(1);
    const action = options.dispatch.mock.calls[0][0] as { payload: { feature: { geometry: { type: string } } } };
    expect(action.payload.feature.geometry.type).toBe("MultiPolygon");
  });
});
