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

type AlertFeature = NwsAlertFeatureCollection['features'][number];

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

const alertProperties = (extra: Record<string, unknown> = {}) => ({
  event: 'Tornado Warning',
  headline: 'Tornado Warning issued',
  areaDesc: 'Test County',
  ...extra,
});

const makeFeature = (
  properties: Record<string, unknown>,
  topId?: string,
): AlertFeature =>
  ({
    type: 'Feature',
    ...(topId === undefined ? {} : { id: topId }),
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    properties,
  }) as AlertFeature;

const makeCollection = (...features: AlertFeature[]): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

const standardCollection = () =>
  makeCollection(makeFeature(alertProperties({ '@id': ALERT_ID }), ALERT_ID));

const makeArgs = (overrides: Partial<Parameters<typeof useMonitorMapOverlaySync>[0]> = {}) =>
  ({
    mapView: { center: [0, 0], zoom: 4 },
    darkMode: false,
    serializedFeatures: [],
    stormReports: [],
    alertsCollection: standardCollection(),
    mesoscaleDiscussions: { type: 'FeatureCollection', features: [] },
    alertsOpacity: 1,
    refs: makeRefs(),
    selectedAlertDetailUrl: null,
    onClearSelectedAlert: jest.fn(),
    ...overrides,
  }) as Parameters<typeof useMonitorMapOverlaySync>[0];

/** Renders the hook and returns dismissal tracking for per-render props. */
const setup = (initialAlertId: string | null = ALERT_ID) => {
  const onClearSelectedAlert = jest.fn();
  const render = renderHook(
    ({
      alertsCollection,
      selectedAlertDetailUrl,
    }: {
      alertsCollection: NwsAlertFeatureCollection;
      selectedAlertDetailUrl: string | null;
    }) =>
      useMonitorMapOverlaySync(
        makeArgs({ alertsCollection, onClearSelectedAlert, selectedAlertDetailUrl }),
      ),
    {
      initialProps: {
        alertsCollection: standardCollection(),
        selectedAlertDetailUrl: initialAlertId,
      },
    },
  );
  return { ...render, onClearSelectedAlert };
};

const otherCollection = () =>
  makeCollection(makeFeature(alertProperties({ '@id': OTHER_ID }), OTHER_ID));

describe('useMonitorMapOverlaySync selected alert dismissal', () => {
  it('does nothing when nothing is selected', () => {
    const { rerender, onClearSelectedAlert } = setup(null);

    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: null });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('retains the selection on a single collection miss (animation frame tick)', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: ALERT_ID });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('clears the selection after two consecutive misses (expired alert)', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: ALERT_ID });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({
      alertsCollection: makeCollection(makeFeature(alertProperties({ '@id': EXPIRED_ID }), EXPIRED_ID)),
      selectedAlertDetailUrl: ALERT_ID,
    });
    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });

  it('resets the miss count when the alert reappears', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: ALERT_ID });
    rerender({ alertsCollection: standardCollection(), selectedAlertDetailUrl: ALERT_ID });
    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: ALERT_ID });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('skips counting on the render where the selection changes', () => {
    const { rerender, onClearSelectedAlert } = setup(ALERT_ID);

    // New selection absent from the incoming collection: not counted yet.
    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: EXPIRED_ID });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    // First counted miss.
    rerender({ alertsCollection: standardCollection(), selectedAlertDetailUrl: EXPIRED_ID });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    // Second consecutive miss clears.
    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: EXPIRED_ID });
    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });

  it('tolerates a single empty collection and clears after two (transient empty)', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({ alertsCollection: makeCollection(), selectedAlertDetailUrl: ALERT_ID });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({ alertsCollection: makeCollection(), selectedAlertDetailUrl: ALERT_ID });
    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });

  it('retains selections without a stable identity until manual dismissal', () => {
    const { rerender, onClearSelectedAlert } = setup('');

    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: '' });
    rerender({ alertsCollection: makeCollection(), selectedAlertDetailUrl: '' });
    rerender({ alertsCollection: otherCollection(), selectedAlertDetailUrl: '' });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('matches the alert through properties @id with an opaque top-level id', () => {
    const { rerender, onClearSelectedAlert } = setup();

    const opaque = makeCollection(makeFeature(alertProperties({ '@id': ALERT_ID }), 'opaque-local-id'));
    rerender({ alertsCollection: opaque, selectedAlertDetailUrl: ALERT_ID });
    rerender({ alertsCollection: opaque, selectedAlertDetailUrl: ALERT_ID });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('matches uri-only and whitespace-padded @id properties', () => {
    const { rerender, onClearSelectedAlert } = setup();

    rerender({
      alertsCollection: makeCollection(makeFeature(alertProperties({ uri: ALERT_ID }))),
      selectedAlertDetailUrl: ALERT_ID,
    });
    rerender({
      alertsCollection: makeCollection(
        makeFeature(alertProperties({ '@id': `  ${ALERT_ID}  ` })),
      ),
      selectedAlertDetailUrl: ALERT_ID,
    });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('matches a canonical top-level id url with no property url', () => {
    const topOnlyUrl = 'https://api.weather.gov/alerts/top-level';
    const { rerender, onClearSelectedAlert } = setup(topOnlyUrl);

    const topOnly = makeCollection(makeFeature(alertProperties({}), topOnlyUrl));
    rerender({ alertsCollection: topOnly, selectedAlertDetailUrl: topOnlyUrl });
    rerender({ alertsCollection: topOnly, selectedAlertDetailUrl: topOnlyUrl });

    expect(onClearSelectedAlert).not.toHaveBeenCalled();
  });

  it('ignores a non-URL top-level id with no canonical property url', () => {
    const { rerender, onClearSelectedAlert } = setup('local-123');

    // Mount skips counting; two further consecutive misses clear.
    const localOnly = () =>
      makeCollection(makeFeature(alertProperties({}), 'local-123'));
    rerender({ alertsCollection: localOnly(), selectedAlertDetailUrl: 'local-123' });
    expect(onClearSelectedAlert).not.toHaveBeenCalled();

    rerender({ alertsCollection: localOnly(), selectedAlertDetailUrl: 'local-123' });
    expect(onClearSelectedAlert).toHaveBeenCalledTimes(1);
  });
});
