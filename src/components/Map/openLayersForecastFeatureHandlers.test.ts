import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { handleModifiedFeatures } from "./openLayersForecastFeatureHandlers";
import { toUpdatedCustomFeature, toUpdatedGeoJsonFeature } from "./openLayersMapStyles";
import { updateCustomFeature, updateFeature } from "../../store/forecastSlice";

jest.mock("./openLayersMapStyles", () => ({
  toUpdatedCustomFeature: jest.fn(),
  toUpdatedGeoJsonFeature: jest.fn(),
}));

jest.mock("../../store/forecastSlice", () => ({
  updateCustomFeature: jest.fn((payload: unknown) => ({ type: "custom", payload })),
  updateFeature: jest.fn((payload: unknown) => ({ type: "feature", payload })),
}));

const mockedToUpdatedCustom = toUpdatedCustomFeature as unknown as jest.Mock;
const mockedToUpdatedGeoJson = toUpdatedGeoJsonFeature as unknown as jest.Mock;
const mockedUpdateFeature = updateFeature as unknown as jest.Mock;
const mockedUpdateCustom = updateCustomFeature as unknown as jest.Mock;

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const stubFeature = (derivedFrom?: string): OLFeature<Geometry> =>
  ({
    get: (key: string) => (key === "derivedFrom" ? derivedFrom : undefined),
  }) as unknown as OLFeature<Geometry>;

describe("handleModifiedFeatures", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("trims a normal edit and dispatches the outlook update", async () => {
    const feature = stubFeature();
    const updated = { type: "Feature", properties: {} };
    const trimmed = { type: "Feature", properties: { trimmed: true } };
    mockedToUpdatedCustom.mockReturnValue(null);
    mockedToUpdatedGeoJson.mockReturnValue(updated);
    const trimStoredOutlookFeature = jest.fn(async () => trimmed as never);
    const dispatch = jest.fn();

    handleModifiedFeatures([feature], false, {
      currentDay: 1,
      dispatch,
      trimStoredOutlookFeature,
    });

    await flush();

    expect(mockedToUpdatedCustom).toHaveBeenCalledTimes(1);
    expect(mockedToUpdatedGeoJson).toHaveBeenCalledTimes(1);
    expect(trimStoredOutlookFeature).toHaveBeenCalledWith(updated);
    expect(mockedUpdateFeature).toHaveBeenCalledWith({ feature: trimmed, day: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(mockedUpdateCustom).not.toHaveBeenCalled();
  });

  test("skips categorical features derived from auto-generation", async () => {
    const feature = stubFeature("auto-generated");
    const trimStoredOutlookFeature = jest.fn(async () => undefined as never);
    const dispatch = jest.fn();

    handleModifiedFeatures([feature], true, {
      currentDay: 1,
      dispatch,
      trimStoredOutlookFeature,
    });

    await flush();

    expect(mockedToUpdatedCustom).not.toHaveBeenCalled();
    expect(mockedToUpdatedGeoJson).not.toHaveBeenCalled();
    expect(trimStoredOutlookFeature).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
