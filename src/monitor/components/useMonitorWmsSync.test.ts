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
      selectedAlertId: null,
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

  it.each([
    {
      name: 'satellite',
      useSync: useMonitorSatelliteWmsSync,
      layer: satelliteLayer,
      opacity: 0.68,
      layerRef: 'satelliteLayerRef',
      keyRef: 'satelliteLayerKeyRef',
    },
    {
      name: 'radar',
      useSync: useMonitorRadarWmsSync,
      layer: radarLayer,
      opacity: 0.72,
      layerRef: 'radarLayerRef',
      keyRef: 'radarLayerKeyRef',
    },
  ])('re-applies the $name WMS layer when its config changes', ({ useSync, layer, opacity, layerRef, keyRef }) => {
    const refs = {
      [layerRef]: { current: tileLayer },
      [keyRef]: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;

    const { rerender } = renderHook(
      ({ config }) => useSync(config, opacity, refs),
      { initialProps: { config: layer } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    rerender({ config: { ...layer, latestTime: '2026-06-02T13:00:00Z' } });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);
  });

});
