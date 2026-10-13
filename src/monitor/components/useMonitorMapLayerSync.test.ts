import { renderHook } from '@testing-library/react';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import { useMonitorMapLayerSync } from './useMonitorMapLayerSync';
import { useMonitorMapOverlaySync } from './useMonitorMapOverlaySync';

jest.mock('./useMonitorMapOverlaySync', () => ({
  useMonitorMapOverlaySync: jest.fn(),
}));

jest.mock('./useMonitorMapWmsSync', () => ({
  useMonitorMapWmsSync: jest.fn(),
}));

const emptyCollection: NwsAlertFeatureCollection = { type: 'FeatureCollection', features: [] };

const makeArgs = () =>
  ({
    mapView: { center: [0, 0], zoom: 4 },
    darkMode: false,
    radarLayer: null,
    radarOpacity: 0.72,
    satelliteLayer: null,
    satelliteOpacity: 0.68,
    serializedFeatures: [],
    stormReports: [],
    alertsCollection: emptyCollection,
    alertsOpacity: 1,
    mesoscaleDiscussions: { type: 'FeatureCollection', features: [] },
    refs: {},
    selectedAlertDetailUrl: 'https://api.weather.gov/alerts/abc',
    onClearSelectedAlert: jest.fn(),
  }) as unknown as Parameters<typeof useMonitorMapLayerSync>[0];

/** Verifies selection-expiry wiring reaches the overlay sync untouched. */
describe('useMonitorMapLayerSync selection forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the selection id and clear callback to the overlay sync', () => {
    const args = makeArgs();
    renderHook(() => useMonitorMapLayerSync(args));

    expect(jest.mocked(useMonitorMapOverlaySync)).toHaveBeenCalledWith(
      expect.objectContaining({
        alertsCollection: emptyCollection,
        selectedAlertDetailUrl: 'https://api.weather.gov/alerts/abc',
        onClearSelectedAlert: args.onClearSelectedAlert,
      }),
    );
  });

  it('forwards null selections without alteration', () => {
    const args = { ...makeArgs(), selectedAlertDetailUrl: null };
    renderHook(() => useMonitorMapLayerSync(args));

    expect(jest.mocked(useMonitorMapOverlaySync)).toHaveBeenCalledWith(
      expect.objectContaining({ selectedAlertDetailUrl: null }),
    );
  });
});
