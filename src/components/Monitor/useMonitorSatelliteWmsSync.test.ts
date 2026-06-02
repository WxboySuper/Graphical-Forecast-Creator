import { renderHook } from '@testing-library/react';
import type { WmsLayerConfig } from '../../monitor/wms';
import * as monitorMapLayerUtils from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorSatelliteWmsSync } from './useMonitorSatelliteWmsSync';

jest.mock('./monitorMapLayerUtils', () => ({
  applyWmsLayer: jest.fn(),
  buildWmsParams: jest.fn(() => ({ LAYERS: 'goes_visible_imagery', TILED: true })),
}));

describe('useMonitorSatelliteWmsSync', () => {
  const satelliteLayer: WmsLayerConfig = {
    url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
    layer: 'goes_visible_imagery',
    latestTime: '2026-06-02T12:00:00Z',
  };

  const tileLayer = { setVisible: jest.fn(), getSource: jest.fn() };
  const refs = {
    satelliteLayerRef: { current: tileLayer },
    satelliteLayerKeyRef: { current: null },
  } as unknown as ReturnType<typeof useMonitorMapRefs>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-applies the satellite WMS layer when dark mode toggles', () => {
    const { rerender } = renderHook(
      ({ darkMode }) => useMonitorSatelliteWmsSync(satelliteLayer, 0.68, refs, darkMode),
      { initialProps: { darkMode: false } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    rerender({ darkMode: true });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);
  });
});
