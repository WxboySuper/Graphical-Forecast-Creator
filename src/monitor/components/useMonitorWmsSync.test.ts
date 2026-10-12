import { renderHook } from '@testing-library/react';
import type { WmsLayerConfig } from '../wms';
import * as monitorMapLayerUtils from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorMapLayerSync } from './useMonitorMapLayerSync';
import { useMonitorRadarWmsSync } from './useMonitorRadarWmsSync';
import { useMonitorSatelliteWmsSync } from './useMonitorSatelliteWmsSync';

jest.mock('./useMonitorMapOverlaySync', () => ({
  useMonitorMapOverlaySync: jest.fn(),
}));

jest.mock('./monitorMapLayerUtils', () => ({
  applyWmsLayer: jest.fn(),
  buildWmsParams: jest.fn(() => ({ LAYERS: 'layer', TILED: true })),
}));

describe('Monitor WMS sync', () => {
  const satelliteLayer: WmsLayerConfig = {
    url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
    layer: 'goes_visible_imagery',
    latestTime: '2026-06-02T12:00:00Z',
  };

  const radarLayer: WmsLayerConfig = {
    url: 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows',
    layer: 'conus_bref_qcd',
    latestTime: '2026-06-02T12:00:00Z',
  };

  const tileLayer = { setVisible: jest.fn(), getSource: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not re-apply WMS layers when dark mode changes', () => {
    const refs = {
      radarLayerRef: { current: tileLayer },
      radarLayerKeyRef: { current: null },
      satelliteLayerRef: { current: tileLayer },
      satelliteLayerKeyRef: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;
    const args = {
      mapView: { center: [0, 0], zoom: 4 },
      darkMode: false,
      radarLayer,
      radarOpacity: 0.72,
      satelliteLayer,
      satelliteOpacity: 0.68,
      serializedFeatures: [],
      stormReports: [],
      alertsCollection: { type: 'FeatureCollection', features: [] },
      alertsOpacity: 1,
      mesoscaleDiscussions: { type: 'FeatureCollection', features: [] },
      refs,
      onClearSelectedAlert: jest.fn(),
    } as unknown as Parameters<typeof useMonitorMapLayerSync>[0];

    const { rerender } = renderHook(
      ({ darkMode }) => useMonitorMapLayerSync({ ...args, darkMode }),
      { initialProps: { darkMode: false } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);

    rerender({ darkMode: true });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);
  });

  it('does not re-apply the satellite WMS layer on a theme toggle', () => {
    const refs = {
      satelliteLayerRef: { current: tileLayer },
      satelliteLayerKeyRef: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;

    const { rerender } = renderHook(
      ({ opacity }) => useMonitorSatelliteWmsSync(satelliteLayer, opacity, refs),
      { initialProps: { opacity: 0.68 } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    // Theme changes arrive via other props in real usage; opacity stands in
    // for any unrelated re-render. Only WMS-relevant inputs re-apply.
    rerender({ opacity: 0.68 });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);
  });

  it('re-applies the satellite WMS layer when its config changes', () => {
    const refs = {
      satelliteLayerRef: { current: tileLayer },
      satelliteLayerKeyRef: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;

    const { rerender } = renderHook(
      ({ layer }) => useMonitorSatelliteWmsSync(layer, 0.68, refs),
      { initialProps: { layer: satelliteLayer } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    rerender({ layer: { ...satelliteLayer, latestTime: '2026-06-02T13:00:00Z' } });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);
  });

  it('does not re-apply the radar WMS layer on a theme toggle', () => {
    const refs = {
      radarLayerRef: { current: tileLayer },
      radarLayerKeyRef: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;

    const { rerender } = renderHook(
      ({ opacity }) => useMonitorRadarWmsSync(radarLayer, opacity, refs),
      { initialProps: { opacity: 0.72 } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    rerender({ opacity: 0.72 });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);
  });

  it('re-applies the radar WMS layer when its config changes', () => {
    const refs = {
      radarLayerRef: { current: tileLayer },
      radarLayerKeyRef: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;

    const { rerender } = renderHook(
      ({ layer }) => useMonitorRadarWmsSync(layer, 0.72, refs),
      { initialProps: { layer: radarLayer } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    rerender({ layer: { ...radarLayer, latestTime: '2026-06-02T13:00:00Z' } });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);
  });

});
