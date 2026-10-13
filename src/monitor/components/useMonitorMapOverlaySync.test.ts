import { renderHook } from '@testing-library/react';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
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

const ALERT_ID = 'https://api.weather.gov/alerts/abc';
const OTHER_ID = 'https://api.weather.gov/alerts/other';
const EXPIRED_ID = 'https://api.weather.gov/alerts/expired';

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

const makeCollection = (id: string | null): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features:
    id === null
      ? []
      : [
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

const makeArgs = (overrides: Partial<Parameters<typeof useMonitorMapOverlaySync>[0]> = {}) =>
  ({
    mapView: { center: [0, 0], zoom: 4 },
    darkMode: false,
    serializedFeatures: [],
    stormReports: [],
    alertsCollection: makeCollection(ALERT_ID),
    mesoscaleDiscussions: { type: 'FeatureCollection', features: [] },
    alertsOpacity: 1,
    refs: makeRefs(),
    selectedAlertId: null,
    onClearSelectedAlert: jest.fn(),
    ...overrides,
  }) as Parameters<typeof useMonitorMapOverlaySync>[0];

/** Renders the hook and returns dismissal tracking for per-render props. */
const setup = (initialAlertId: string | null = ALERT_ID) => {
  const onClearSelectedAlert = jest.fn();
  const render = renderHook(
    ({
      alertsCollection,
      selectedAlertId,
    }: {
      alertsCollection: NwsAlertFeatureCollection;
      selectedAlertId: string | null;
    }) =>
      useMonitorMapOverlaySync(
        makeArgs({ alertsCollection, onClearSelectedAlert, selectedAlertId }),
      ),
    { initialProps: { alertsCollection: makeCollection(ALERT_ID), selectedAlertId: initialAlertId } },
  );
  return { ...render, onClearSelectedAlert };
};

describe('useMonitorMapOverlaySync selected alert dismissal', () => {
  it('does nothing when nothing is selected', () => {
    const { rerender, onClearSelectedAlert } = setup(null);

    rerender({ alertsCollection: makeCollection(OTHER_ID), selectedAlertId: null });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('retains the selection on a single collection miss (animation frame tick)', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: makeCollection(OTHER_ID), selectedAlertId: ALERT_ID });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('clears the selection after two consecutive misses (expired alert)', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: makeCollection(OTHER_ID), selectedAlertId: ALERT_ID });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({ alertsCollection: makeCollection(EXPIRED_ID), selectedAlertId: ALERT_ID });
    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });

  it('resets the miss count when the alert reappears', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: makeCollection(OTHER_ID), selectedAlertId: ALERT_ID });
    rerender({ alertsCollection: makeCollection(ALERT_ID), selectedAlertId: ALERT_ID });
    rerender({ alertsCollection: makeCollection(OTHER_ID), selectedAlertId: ALERT_ID });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('skips counting on the render where the selection changes', () => {
    const { rerender, onClearSelectedAlert } = setup(ALERT_ID);

    // New selection absent from the incoming collection: no count yet.
    rerender({ alertsCollection: makeCollection(OTHER_ID), selectedAlertId: EXPIRED_ID });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    // First counted miss.
    rerender({ alertsCollection: makeCollection(ALERT_ID), selectedAlertId: EXPIRED_ID });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    // Second consecutive miss clears.
    rerender({ alertsCollection: makeCollection(OTHER_ID), selectedAlertId: EXPIRED_ID });
    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });

  it('dismisses immediately when the collection becomes empty (alerts off)', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: makeCollection(null), selectedAlertId: ALERT_ID });

    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });
});
