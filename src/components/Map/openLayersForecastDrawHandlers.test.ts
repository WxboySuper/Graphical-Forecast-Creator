import Feature from "ol/Feature";
import Polygon from "ol/geom/Polygon";
import Point from "ol/geom/Point";
import type Geometry from "ol/geom/Geometry";
import type { MultiPolygon, Polygon as GeoJsonPolygon } from "geojson";
import { handleForecastDrawEnd, type DrawnFeatureHandlerOptions } from "./openLayersForecastDrawHandlers";
import { captureException } from "@sentry/react";

jest.mock("@sentry/react", () => ({ captureException: jest.fn() }));

const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

const polygonFeature = () => new Feature({
  geometry: new Polygon([[[0, 0], [10, 0], [10, 10], [0, 0]]]),
});

const pointFeature = () => new Feature({
  geometry: new Point([0, 0]),
});

type DrawOptions = DrawnFeatureHandlerOptions;

const baseOptions = (overrides: Partial<DrawOptions> = {}): DrawOptions & {
  dispatch: jest.Mock;
  trimGeometryForAutoDraw: jest.Mock;
} => {
  const dispatch = jest.fn();
  const trimGeometryForAutoDraw = jest.fn(async (geometry: GeoJsonPolygon | MultiPolygon) => geometry);
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
      activeCustomLayer: { id: "layer-1" } as never,
      activeCustomCategory: { id: "cat-1", label: "Heavy snow" } as never,
    });

    handleForecastDrawEnd({ feature: polygonFeature() as Feature<Geometry> }, options);
    await flush();

    expect(options.trimGeometryForAutoDraw).not.toHaveBeenCalled();
    expect(options.dispatch).toHaveBeenCalledTimes(1);
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
    const empty = new Feature() as Feature<Geometry>;

    handleForecastDrawEnd({ feature: empty }, options);
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
});
