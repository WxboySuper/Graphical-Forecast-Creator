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

describe("syncMapViewFromOpenLayers", () => {
  test("dispatches latitude/longitude ordered center from OpenLayers coordinates", () => {
    const lon = -98.5795;
    const lat = 39.8283;
    const view = createView();
    view.getCenter.mockReturnValue(fromLonLat([lon, lat]));
    view.getZoom.mockReturnValue(5);
    const map = createMap(view);
    const dispatch = jest.fn();

    syncMapViewFromOpenLayers({
      map: asOLMap(map),
      isApplyingExternalViewRef: createFlagRef(false),
      currentMapViewRef: createMapViewRef({ center: [0, 0], zoom: 4 }),
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const dispatchedAction = dispatch.mock.calls[0][0] as ReturnType<
      typeof setMapView
    >;
    expect(dispatchedAction.type).toBe(setMapView.type);
    expect(dispatchedAction.payload.zoom).toBe(5);
    expect(dispatchedAction.payload.center[0]).toBeCloseTo(lat, 6);
    expect(dispatchedAction.payload.center[1]).toBeCloseTo(lon, 6);
    const dispatchedCenter = dispatch.mock.calls[0][0].payload.center as [
      number,
      number,
    ];
    // toLonLat round-trip keeps ordering explicit even with projection math.
    const [roundLon, roundLat] = toLonLat(fromLonLat([lon, lat]));
    expect(dispatchedCenter[0]).toBeCloseTo(roundLat, 6);
    expect(dispatchedCenter[1]).toBeCloseTo(roundLon, 6);
  });

  test("does not dispatch when center and zoom are within tolerance", () => {
    const lon = -100;
    const lat = 40;
    const [exactLon, exactLat] = toLonLat(fromLonLat([lon, lat]));
    const view = createView();
    view.getCenter.mockReturnValue(fromLonLat([lon, lat]));
    view.getZoom.mockReturnValue(6);
    const map = createMap(view);
    const dispatch = jest.fn();

    syncMapViewFromOpenLayers({
      map: asOLMap(map),
      isApplyingExternalViewRef: createFlagRef(false),
      currentMapViewRef: createMapViewRef({
        center: [exactLat + 0.0000005, exactLon + 0.0000005],
        zoom: 6 + 0.0000005,
      }),
      dispatch,
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("dispatches when zoom differs beyond tolerance", () => {
    const lon = -100;
    const lat = 40;
    const view = createView();
    view.getCenter.mockReturnValue(fromLonLat([lon, lat]));
    view.getZoom.mockReturnValue(7);
    const map = createMap(view);
    const dispatch = jest.fn();
    const [stateLon, stateLat] = toLonLat(fromLonLat([lon, lat]));

    syncMapViewFromOpenLayers({
      map: asOLMap(map),
      isApplyingExternalViewRef: createFlagRef(false),
      currentMapViewRef: createMapViewRef({
        center: [stateLat, stateLon],
        zoom: 4,
      }),
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].payload.zoom).toBe(7);
  });

  test("suppresses dispatch while an external view update is applied", () => {
    const view = createView();
    view.getCenter.mockReturnValue(fromLonLat([-98, 39]));
    view.getZoom.mockReturnValue(9);
    const map = createMap(view);
    const dispatch = jest.fn();

    syncMapViewFromOpenLayers({
      map: asOLMap(map),
      isApplyingExternalViewRef: createFlagRef(true),
      currentMapViewRef: createMapViewRef({ center: [0, 0], zoom: 4 }),
      dispatch,
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(view.getCenter).not.toHaveBeenCalled();
  });

  test("ignores a null center without dispatching", () => {
    const view = createView();
    view.getCenter.mockReturnValue(undefined);
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
    const view = createView();
    view.getCenter.mockReturnValue(fromLonLat([-98.5795, 39.8283]));
    view.getZoom.mockReturnValue(undefined);
    const map = createMap(view);
    const dispatch = jest.fn();

    syncMapViewFromOpenLayers({
      map: asOLMap(map),
      isApplyingExternalViewRef: createFlagRef(false),
      currentMapViewRef: createMapViewRef({ center: [0, 0], zoom: 5 }),
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].payload.zoom).toBe(4);
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
    const view = createView();
    view.getCenter.mockReturnValue([0, 0]);
    view.getZoom.mockReturnValue(4);
    const map = createMap(view);
    const flagRef = createFlagRef(false);
    const currentMapView: ForecastMapView = { center: [39.8283, -98.5795], zoom: 5 };

    syncOpenLayersViewFromState({
      map: asOLMap(map),
      currentMapView,
      isApplyingExternalViewRef: flagRef,
    });

    const expectedCenter = fromLonLat([
      currentMapView.center[1],
      currentMapView.center[0],
    ]);
    expect(view.setCenter).toHaveBeenCalledTimes(1);
    expect(view.setCenter).toHaveBeenCalledWith(expectedCenter);
    expect(view.setZoom).toHaveBeenCalledWith(5);
    expect(flagRef.current).toBe(true);

    jest.runAllTimers();
    expect(flagRef.current).toBe(false);
  });

  test("does nothing when the OpenLayers view already matches state", () => {
    const currentMapView: ForecastMapView = { center: [39.8283, -98.5795], zoom: 5 };
    const targetCenter = fromLonLat([
      currentMapView.center[1],
      currentMapView.center[0],
    ]);
    const view = createView();
    view.getCenter.mockReturnValue([...targetCenter]);
    view.getZoom.mockReturnValue(5);
    const map = createMap(view);
    const flagRef = createFlagRef(false);

    syncOpenLayersViewFromState({
      map: asOLMap(map),
      currentMapView,
      isApplyingExternalViewRef: flagRef,
    });

    expect(view.setCenter).not.toHaveBeenCalled();
    expect(view.setZoom).not.toHaveBeenCalled();
    expect(flagRef.current).toBe(false);
  });

  test("treats center differences within projection tolerance as a no-op", () => {
    const currentMapView: ForecastMapView = { center: [39.8283, -98.5795], zoom: 5 };
    const targetCenter = fromLonLat([
      currentMapView.center[1],
      currentMapView.center[0],
    ]);
    const view = createView();
    view.getCenter.mockReturnValue([targetCenter[0] + 0.005, targetCenter[1] - 0.005]);
    view.getZoom.mockReturnValue(5);
    const map = createMap(view);
    const flagRef = createFlagRef(false);

    syncOpenLayersViewFromState({
      map: asOLMap(map),
      currentMapView,
      isApplyingExternalViewRef: flagRef,
    });

    expect(view.setCenter).not.toHaveBeenCalled();
    expect(view.setZoom).not.toHaveBeenCalled();
    expect(flagRef.current).toBe(false);
  });

  test("updates the view when OpenLayers has no center", () => {
    const view = createView();
    view.getCenter.mockReturnValue(undefined);
    view.getZoom.mockReturnValue(5);
    const map = createMap(view);
    const flagRef = createFlagRef(false);
    const currentMapView: ForecastMapView = { center: [39.8283, -98.5795], zoom: 5 };

    syncOpenLayersViewFromState({
      map: asOLMap(map),
      currentMapView,
      isApplyingExternalViewRef: flagRef,
    });

    expect(view.setCenter).toHaveBeenCalledTimes(1);
    expect(view.setZoom).toHaveBeenCalledWith(5);
    expect(flagRef.current).toBe(true);
  });

  test("uses zoom fallback when OpenLayers zoom is missing", () => {
    const currentMapView: ForecastMapView = { center: [39.8283, -98.5795], zoom: 4 };
    const targetCenter = fromLonLat([
      currentMapView.center[1],
      currentMapView.center[0],
    ]);
    const view = createView();
    view.getCenter.mockReturnValue([...targetCenter]);
    view.getZoom.mockReturnValue(undefined);
    const map = createMap(view);
    const flagRef = createFlagRef(false);

    syncOpenLayersViewFromState({
      map: asOLMap(map),
      currentMapView,
      isApplyingExternalViewRef: flagRef,
    });

    expect(view.setCenter).not.toHaveBeenCalled();
    expect(view.setZoom).not.toHaveBeenCalled();
    expect(flagRef.current).toBe(false);
  });
});
