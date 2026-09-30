import { renderHook } from '@testing-library/react';
import VectorSource from 'ol/source/Vector';
import { useMonitorMapOverlaySync } from './useMonitorMapOverlaySync';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';

const makeAlertsCollection = (ids: string[]): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features: ids.map((id) => ({
    type: 'Feature' as const,
    id,
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: { id, event: 'Tornado Warning' },
  })),
});

const makeRefs = () =>
  ({
    mapRef: { current: null },
    stateOutlineSourceRef: { current: new VectorSource() },
    outlookSourceRef: { current: new VectorSource() },
    alertsSourceRef: { current: new VectorSource() },
    stormReportsSourceRef: { current: new VectorSource() },
    mesoscaleDiscussionSourceRef: { current: new VectorSource() },
    alertsLayerRef: { current: null },
    mesoscaleDiscussionLayerRef: { current: null },
    applyingExternalViewRef: { current: false },
  }) as never;

const baseArgs = (alertsCollection: NwsAlertFeatureCollection, onClearSelectedAlert: () => void) => ({
  mapView: { center: [0, 0] as [number, number], zoom: 4 },
  darkMode: false,
  serializedFeatures: [],
  stormReports: [],
  alertsCollection,
  mesoscaleDiscussions: { type: 'FeatureCollection' as const, features: [] },
  alertsOpacity: 1,
  refs: makeRefs(),
  onClearSelectedAlert,
});

describe('useMonitorMapOverlaySync alert selection', () => {
  test('keeps the selected alert popup open across non-empty animation frames', () => {
    const onClearSelectedAlert = jest.fn();
    const firstFrame = makeAlertsCollection(['alert-1']);
    const secondFrame = makeAlertsCollection(['alert-2']);

    const { rerender } = renderHook(({ alertsCollection }) => useMonitorMapOverlaySync(baseArgs(alertsCollection, onClearSelectedAlert)), {
      initialProps: { alertsCollection: firstFrame },
    });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({ alertsCollection: secondFrame });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  test('clears the selected alert popup when alerts become empty', () => {
    const onClearSelectedAlert = jest.fn();
    const firstFrame = makeAlertsCollection(['alert-1']);
    const empty = makeAlertsCollection([]);

    const { rerender } = renderHook(({ alertsCollection }) => useMonitorMapOverlaySync(baseArgs(alertsCollection, onClearSelectedAlert)), {
      initialProps: { alertsCollection: firstFrame },
    });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({ alertsCollection: empty });

    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });
});
