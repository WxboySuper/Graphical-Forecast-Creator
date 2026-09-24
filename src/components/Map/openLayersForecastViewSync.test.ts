import type OLMap from "ol/Map";
import { fromLonLat, toLonLat } from "ol/proj";
import type { MutableRefObject } from "react";
import { setMapView } from "../../store/forecastSlice";
import {
  syncMapViewFromOpenLayers,
  syncOpenLayersViewFromState,
  type ForecastMapView,
} from "./openLayersForecastViewSync";

type MockView = {
  getCenter: jest.Mock;
  getZoom: jest.Mock;
  setCenter: jest.Mock;
  setZoom: jest.Mock;
};

type MockMap = {
  getView: jest.Mock;
};

const USA_LON = -98.5795;
const USA_LAT = 39.8283;
const USA_STATE_CENTER: [number, number] = [USA_LAT, USA_LON];

const createView = (overrides: Partial<MockView> = {}): MockView => ({
  getCenter: jest.fn(),
  getZoom: jest.fn(),
  setCenter: jest.fn(),
  setZoom: jest.fn(),
  ...overrides,
});

const createMap = (view: MockView): MockMap => ({
  getView: jest.fn(() => view),
});

const asOLMap = (map: MockMap): OLMap => map as unknown as OLMap;

const createFlagRef = (value = false): MutableRefObject<boolean> => ({
  current: value,
}) as MutableRefObject<boolean>;

const createMapViewRef = (
  value: ForecastMapView,
): MutableRefObject<ForecastMapView> => ({
  current: value,
}) as MutableRefObject<ForecastMapView>;

const mockViewWithCenterZoom = (center: unknown, zoom: unknown): MockView => {
  const view = createView();
  view.getCenter.mockReturnValue(center);
  view.getZoom.mockReturnValue(zoom);
  return view;
};

const runSyncFromOpenLayers = (options: {
  olCenter: unknown;
  olZoom: unknown;
  applyingFlag?: boolean;
  stateCenter?: [number, number];
  stateZoom?: number;
}): { view: MockView; dispatch: jest.Mock } => {
  const view = mockViewWithCenterZoom(options.olCenter, options.olZoom);
  const map = createMap(view);
  const dispatch = jest.fn();
  syncMapViewFromOpenLayers({
    map: asOLMap(map),
    isApplyingExternalViewRef: createFlagRef(options.applyingFlag ?? false),
    currentMapViewRef: createMapViewRef({
      center: options.stateCenter ?? [0, 0],
      zoom: options.stateZoom ?? 4,
    }),
    dispatch,
  });
  return { view, dispatch };
};

const dispatchedPayload = (dispatch: jest.Mock): { center: [number, number]; zoom: number } =>
  dispatch.mock.calls[0][0].payload;

const targetCenterFor = (center: [number, number]): number[] =>
  fromLonLat([center[1], center[0]]);

const runSyncFromState = (options: {
  stateCenter?: [number, number];
  stateZoom?: number;
  olCenter?: unknown;
  olZoom?: unknown;
}): { view: MockView; flagRef: MutableRefObject<boolean> } => {
  const stateCenter = options.stateCenter ?? USA_STATE_CENTER;
  const stateZoom = options.stateZoom ?? 5;
  const view = mockViewWithCenterZoom(options.olCenter, options.olZoom);
  const map = createMap(view);
  const flagRef = createFlagRef(false);
  syncOpenLayersViewFromState({
    map: asOLMap(map),
    currentMapView: { center: stateCenter, zoom: stateZoom },
    isApplyingExternalViewRef: flagRef,
  });
  return { view, flagRef };
};

describe("syncMapViewFromOpenLayers", () => {
  test("dispatches latitude/longitude ordered center from OpenLayers coordinates", () => {
    const { dispatch } = runSyncFromOpenLayers({
      olCenter: fromLonLat([USA_LON, USA_LAT]),
      olZoom: 5,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const dispatchedAction = dispatch.mock.calls[0][0] as ReturnType<typeof setMapView>;
    expect(dispatchedAction.type).toBe(setMapView.type);
    const payload = dispatchedPayload(dispatch);
    expect(payload.zoom).toBe(5);
    expect(payload.center[0]).toBeCloseTo(USA_LAT, 6);
    expect(payload.center[1]).toBeCloseTo(USA_LON, 6);
    // toLonLat round-trip keeps ordering explicit even with projection math.
    const [roundLon, roundLat] = toLonLat(fromLonLat([USA_LON, USA_LAT]));
    expect(payload.center[0]).toBeCloseTo(roundLat, 6);
    expect(payload.center[1]).toBeCloseTo(roundLon, 6);
  });

  test("does not dispatch when center and zoom are within tolerance", () => {
    const lon = -100;
    const lat = 40;
    const [exactLon, exactLat] = toLonLat(fromLonLat([lon, lat]));

    const { dispatch } = runSyncFromOpenLayers({
      olCenter: fromLonLat([lon, lat]),
      olZoom: 6,
      stateCenter: [exactLat + 0.0000005, exactLon + 0.0000005],
      stateZoom: 6 + 0.0000005,
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("dispatches when zoom differs beyond tolerance", () => {
    const lon = -100;
    const lat = 40;
    const [stateLon, stateLat] = toLonLat(fromLonLat([lon, lat]));

    const { dispatch } = runSyncFromOpenLayers({
      olCenter: fromLonLat([lon, lat]),
      olZoom: 7,
      stateCenter: [stateLat, stateLon],
      stateZoom: 4,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatchedPayload(dispatch).zoom).toBe(7);
  });

  test("suppresses dispatch while an external view update is applied", () => {
    const { view, dispatch } = runSyncFromOpenLayers({
      olCenter: fromLonLat([-98, 39]),
      olZoom: 9,
      applyingFlag: true,
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(view.getCenter).not.toHaveBeenCalled();
  });

  test("ignores a null center without dispatching", () => {
    const view = mockViewWithCenterZoom(undefined, 4);
    const map = createMap(view);
    const dispatch = jest.fn();

    expect(() =>
      syncMapViewFromOpenLayers({
        map: asOLMap(map),
        isApplyingExternalViewRef: createFlagRef(false),
        currentMapViewRef: createMapViewRef({ center: [0, 0], zoom: 4 }),
        dispatch,
      }),
    ).not.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("falls back to zoom 4 when OpenLayers zoom is missing", () => {
    const { dispatch } = runSyncFromOpenLayers({
      olCenter: fromLonLat([USA_LON, USA_LAT]),
      olZoom: undefined,
      stateZoom: 5,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatchedPayload(dispatch).zoom).toBe(4);
  });
});

describe("syncOpenLayersViewFromState", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("applies Redux center with longitude/latitude ordering and resets suppression", () => {
    const { view, flagRef } = runSyncFromState({
      olCenter: [0, 0],
      olZoom: 4,
    });

    const expectedCenter = targetCenterFor(USA_STATE_CENTER);
    expect(view.setCenter).toHaveBeenCalledTimes(1);
    expect(view.setCenter).toHaveBeenCalledWith(expectedCenter);
    expect(view.setZoom).toHaveBeenCalledWith(5);
    expect(flagRef.current).toBe(true);

    jest.runAllTimers();
    expect(flagRef.current).toBe(false);
  });

  test.each([
    {
      name: "already matches state",
      olCenter: () => targetCenterFor(USA_STATE_CENTER),
      olZoom: 5,
      stateZoom: 5,
    },
    {
      name: "within projection tolerance",
      olCenter: () => {
        const target = targetCenterFor(USA_STATE_CENTER);
        return [target[0] + 0.005, target[1] - 0.005];
      },
      olZoom: 5,
      stateZoom: 5,
    },
    {
      name: "when OpenLayers zoom is missing and state uses the fallback",
      olCenter: () => [...targetCenterFor([USA_LAT, USA_LON])],
      olZoom: undefined,
      stateZoom: 4,
    },
  ])("does nothing $name", ({ olCenter, olZoom, stateZoom }) => {
    const stateCenter: [number, number] =
      stateZoom === 5 ? USA_STATE_CENTER : [USA_LAT, USA_LON];
    const { view, flagRef } = runSyncFromState({
      stateCenter,
      stateZoom,
      olCenter: olCenter(),
      olZoom,
    });

    expect(view.setCenter).not.toHaveBeenCalled();
    expect(view.setZoom).not.toHaveBeenCalled();
    expect(flagRef.current).toBe(false);
  });

  test("updates the view when OpenLayers has no center", () => {
    const { view, flagRef } = runSyncFromState({
      olCenter: undefined,
      olZoom: 5,
    });

    expect(view.setCenter).toHaveBeenCalledTimes(1);
    expect(view.setZoom).toHaveBeenCalledWith(5);
    expect(flagRef.current).toBe(true);
  });
});
