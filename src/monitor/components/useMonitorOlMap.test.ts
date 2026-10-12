import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { NwsAlertDetails } from '../nwsAlertDetails';
import { useMonitorOlMap } from './useMonitorOlMap';
import { useMonitorMapBootstrap } from './useMonitorMapBootstrap';
import { useMonitorMapLayerSync } from './useMonitorMapLayerSync';
import { clearMonitorAlertPopup, renderMonitorAlertPopup } from './renderMonitorAlertPopup';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(() => false),
}));

jest.mock('./useMonitorMapBootstrap', () => ({
  useMonitorMapBootstrap: jest.fn(),
}));

jest.mock('./useMonitorMapLayerSync', () => ({
  useMonitorMapLayerSync: jest.fn(),
}));

jest.mock('./monitorMapRefs', () => {
  const { useRef } = jest.requireActual('react');
  return {
    useMonitorMapRefs: () => ({
      overlayRef: useRef(null),
      popupElRef: useRef(globalThis.document.createElement('div')),
    }),
  };
});

jest.mock('./renderMonitorAlertPopup', () => ({
  clearMonitorAlertPopup: jest.fn(),
  renderMonitorAlertPopup: jest.fn(() => jest.fn()),
}));

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

const selectedDetails: NwsAlertDetails = {
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
  detailUrl: 'https://api.weather.gov/alerts/abc',
};

const makeArgs = (alertsCollection: NwsAlertFeatureCollection) =>
  ({
    mapView: { center: [0, 0], zoom: 4 },
    radarLayer: null,
    radarOpacity: 0.72,
    satelliteLayer: null,
    satelliteOpacity: 0.68,
    serializedFeatures: [],
    stormReports: [],
    alertsCollection,
    alertsOpacity: 1,
    mesoscaleDiscussions: { type: 'FeatureCollection', features: [] },
    mapElementRef: { current: document.createElement('div') } as RefObject<HTMLDivElement | null>,
  }) as Parameters<typeof useMonitorOlMap>[0];

describe('useMonitorOlMap selected alert retention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the selected alert popup open across animation frame collection changes', () => {
    const first = makeCollection('https://api.weather.gov/alerts/abc');
    // New collection identity, as produced on every animation tick.
    const second = makeCollection('https://api.weather.gov/alerts/abc');

    const { rerender } = renderHook(
      ({ alertsCollection }) => useMonitorOlMap(makeArgs(alertsCollection)),
      { initialProps: { alertsCollection: first } },
    );

    // Mount with no selection clears the empty popup container once.
    expect(clearMonitorAlertPopup).toHaveBeenCalledTimes(1);

    const onSelectAlert = jest.mocked(useMonitorMapBootstrap).mock.calls[0][0].onSelectAlert;
    act(() => {
      onSelectAlert(selectedDetails);
    });
    expect(renderMonitorAlertPopup).toHaveBeenCalledTimes(1);
    expect(renderMonitorAlertPopup).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      selectedDetails,
      expect.any(Function),
    );

    rerender({ alertsCollection: second });

    // The popup is retained: nothing clears or re-renders it on collection change.
    expect(clearMonitorAlertPopup).toHaveBeenCalledTimes(1);
    expect(renderMonitorAlertPopup).toHaveBeenCalledTimes(1);

    // The new collection still reaches the layer sync for map rendering.
    const lastLayerSyncArgs = jest.mocked(useMonitorMapLayerSync).mock.calls.at(-1)?.[0];
    expect(lastLayerSyncArgs?.alertsCollection).toBe(second);
  });

  it('still dismisses the popup when the user closes it or clicks elsewhere', () => {
    const { rerender } = renderHook(
      ({ alertsCollection }) => useMonitorOlMap(makeArgs(alertsCollection)),
      { initialProps: { alertsCollection: makeCollection('https://api.weather.gov/alerts/abc') } },
    );

    const onSelectAlert = jest.mocked(useMonitorMapBootstrap).mock.calls[0][0].onSelectAlert;
    act(() => {
      onSelectAlert(selectedDetails);
    });
    expect(renderMonitorAlertPopup).toHaveBeenCalledTimes(1);

    act(() => {
      onSelectAlert(null);
    });
    expect(clearMonitorAlertPopup).toHaveBeenCalledTimes(2);

    rerender({ alertsCollection: makeCollection('https://api.weather.gov/alerts/other') });
    expect(clearMonitorAlertPopup).toHaveBeenCalledTimes(2);
  });
});
