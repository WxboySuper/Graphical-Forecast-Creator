import { renderHook } from '@testing-library/react';
import VectorSource from 'ol/source/Vector';
import {
  isSelectedAlertInCollection,
  useMonitorMapOverlaySync,
} from './useMonitorMapOverlaySync';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { NwsAlertDetails } from '../nwsAlertDetails';
import type { useMonitorMapRefs } from './monitorMapRefs';

const makeRefs = () =>
  ({
    stateOutlineSourceRef: { current: new VectorSource() },
    mapRef: { current: null },
    applyingExternalViewRef: { current: false },
    outlookSourceRef: { current: new VectorSource() },
    alertsLayerRef: { current: null },
    alertsSourceRef: { current: new VectorSource() },
    mesoscaleDiscussionSourceRef: { current: new VectorSource() },
    mesoscaleDiscussionLayerRef: { current: null },
    stormReportsSourceRef: { current: new VectorSource() },
  }) as unknown as ReturnType<typeof useMonitorMapRefs>;

const baseArgs = (overrides: Partial<Parameters<typeof useMonitorMapOverlaySync>[0]> = {}) => ({
  mapView: { center: [0, 0] as [number, number], zoom: 4 },
  darkMode: false,
  serializedFeatures: [],
  stormReports: [],
  alertsCollection: { type: 'FeatureCollection', features: [] } as NwsAlertFeatureCollection,
  mesoscaleDiscussions: { type: 'FeatureCollection', features: [] } as never,
  alertsOpacity: 1,
  refs: makeRefs(),
  selectedAlert: null,
  onClearSelectedAlert: jest.fn(),
  ...overrides,
});

const makeCollectionWithUrl = (url: string): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: url,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { id: url, event: 'Tornado Warning' },
    },
  ],
});

const selectedWithUrl = (url: string): NwsAlertDetails => ({
  event: 'Tornado Warning',
  headline: null,
  areaDesc: null,
  severity: null,
  certainty: null,
  urgency: null,
  effective: null,
  expires: null,
  description: null,
  instruction: null,
  senderName: null,
  detailUrl: url,
});

describe('isSelectedAlertInCollection', () => {
  test('matches alerts by detail URL', () => {
    const url = 'https://api.weather.gov/alerts/1';
    expect(isSelectedAlertInCollection(makeCollectionWithUrl(url), selectedWithUrl(url))).toBe(true);
    expect(
      isSelectedAlertInCollection(makeCollectionWithUrl('https://api.weather.gov/alerts/2'), selectedWithUrl(url)),
    ).toBe(false);
  });

  test('treats a missing selection as present', () => {
    expect(
      isSelectedAlertInCollection(makeCollectionWithUrl('https://api.weather.gov/alerts/1'), null),
    ).toBe(true);
  });
});

describe('useMonitorMapOverlaySync selected alert', () => {
  test('keeps the popup when animation advances to a new collection with the same alert', () => {
    const url = 'https://api.weather.gov/alerts/1';
    const onClearSelectedAlert = jest.fn();
    const refs = makeRefs();

    const { rerender } = renderHook(
      ({ alertsCollection }) =>
        useMonitorMapOverlaySync(
          baseArgs({ alertsCollection, refs, selectedAlert: selectedWithUrl(url), onClearSelectedAlert }),
        ),
      { initialProps: { alertsCollection: makeCollectionWithUrl(url) } },
    );

    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    // Simulate an animation tick: a new collection identity with the same alert.
    rerender({ alertsCollection: makeCollectionWithUrl(url) });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  test('clears the popup when the selected alert leaves the active collection', () => {
    const onClearSelectedAlert = jest.fn();
    const refs = makeRefs();

    const { rerender } = renderHook(
      ({ alertsCollection }) =>
        useMonitorMapOverlaySync(
          baseArgs({
            alertsCollection,
            refs,
            selectedAlert: selectedWithUrl('https://api.weather.gov/alerts/1'),
            onClearSelectedAlert,
          }),
        ),
      { initialProps: { alertsCollection: makeCollectionWithUrl('https://api.weather.gov/alerts/1') } },
    );

    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({ alertsCollection: makeCollectionWithUrl('https://api.weather.gov/alerts/2') });
    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });
});
