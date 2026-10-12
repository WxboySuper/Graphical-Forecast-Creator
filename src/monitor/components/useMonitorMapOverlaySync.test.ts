import { renderHook } from '@testing-library/react';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { NwsAlertDetails } from '../nwsAlertDetails';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorMapOverlaySync } from './useMonitorMapOverlaySync';

jest.mock('./monitorMapFeatureSync', () => ({
  syncAlertFeatures: jest.fn(),
  syncMesoscaleDiscussionFeatures: jest.fn(),
  syncOutlookFeatures: jest.fn(),
  syncStormReportFeatures: jest.fn(),
}));

jest.mock('./monitorMapLayerUtils', () => ({
  createStateOutlineStyle: jest.fn(() => ({})),
}));

const makeRefs = () =>
  ({
    mapRef: { current: null },
    applyingExternalViewRef: { current: false },
    stateOutlineSourceRef: { current: { getFeatures: () => [] } },
    outlookSourceRef: { current: {} },
    alertsSourceRef: { current: {} },
    stormReportsSourceRef: { current: {} },
    mesoscaleDiscussionSourceRef: { current: {} },
    alertsLayerRef: { current: { setOpacity: jest.fn() } },
    mesoscaleDiscussionLayerRef: { current: { setVisible: jest.fn() } },
  }) as unknown as ReturnType<typeof useMonitorMapRefs>;

const makeCollection = (id: string): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: {
        '@id': id,
        event: 'Tornado Warning',
        headline: 'Tornado Warning issued',
        areaDesc: 'Test County',
      },
    },
  ],
});

const makeDetails = (id: string): NwsAlertDetails => ({
  event: 'Tornado Warning',
  headline: 'Tornado Warning issued',
  areaDesc: 'Test County',
  severity: null,
  certainty: null,
  urgency: null,
  effective: null,
  expires: null,
  description: null,
  instruction: null,
  senderName: null,
  detailUrl: id,
});

const makeArgs = (overrides: Partial<Parameters<typeof useMonitorMapOverlaySync>[0]> = {}) =>
  ({
    mapView: { center: [0, 0], zoom: 4 },
    darkMode: false,
    serializedFeatures: [],
    stormReports: [],
    alertsCollection: makeCollection('https://api.weather.gov/alerts/abc'),
    mesoscaleDiscussions: { type: 'FeatureCollection', features: [] },
    alertsOpacity: 1,
    refs: makeRefs(),
    onClearSelectedAlert: jest.fn(),
    selectedAlert: null,
    ...overrides,
  }) as Parameters<typeof useMonitorMapOverlaySync>[0];

describe('useMonitorMapOverlaySync selected alert', () => {
  it('does not clear when nothing is selected', () => {
    const onClearSelectedAlert = jest.fn();
    renderHook(() => useMonitorMapOverlaySync(makeArgs({ onClearSelectedAlert })));

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('preserves the popup across animation frames when the alert persists', () => {
    const onClearSelectedAlert = jest.fn();
    const selectedAlert = makeDetails('https://api.weather.gov/alerts/abc');
    const first = makeCollection('https://api.weather.gov/alerts/abc');
    // New collection identity (as produced every animation tick) with the same alert.
    const second = makeCollection('https://api.weather.gov/alerts/abc');

    const { rerender } = renderHook(
      ({ alertsCollection }) =>
        useMonitorMapOverlaySync(makeArgs({ alertsCollection, onClearSelectedAlert, selectedAlert })),
      { initialProps: { alertsCollection: first } },
    );

    rerender({ alertsCollection: second });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('clears the popup when the selected alert leaves the collection', () => {
    const onClearSelectedAlert = jest.fn();
    const selectedAlert = makeDetails('https://api.weather.gov/alerts/abc');

    const { rerender } = renderHook(
      ({ alertsCollection }) =>
        useMonitorMapOverlaySync(makeArgs({ alertsCollection, onClearSelectedAlert, selectedAlert })),
      { initialProps: { alertsCollection: makeCollection('https://api.weather.gov/alerts/abc') } },
    );

    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({ alertsCollection: makeCollection('https://api.weather.gov/alerts/other') });

    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });
});
