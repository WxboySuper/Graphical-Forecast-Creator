import {
  appendAlertSnapshotFrame,
  classifyNwsAlert,
  filterNwsAlertCollection,
  fetchActiveNwsAlerts,
  MAX_ACTIVE_ALERTS,
  snapshotCollectionKey,
  snapshotCollectionsEqual,
  type NwsAlertFeatureCollection,
} from './nwsAlerts';

describe('nwsAlerts', () => {
  test('classifyNwsAlert distinguishes watches and warnings', () => {
    expect(classifyNwsAlert('Tornado Watch')).toBe('watch');
    expect(classifyNwsAlert('Severe Thunderstorm Warning')).toBe('warning');
    expect(classifyNwsAlert('Flood Advisory')).toBe('advisory');
  });

  test('filterNwsAlertCollection respects category toggles', () => {
    const collection = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { event: 'Tornado Watch' },
          geometry: { type: 'Polygon' as const, coordinates: [] },
        },
        {
          type: 'Feature' as const,
          properties: { event: 'Severe Thunderstorm Warning' },
          geometry: { type: 'Polygon' as const, coordinates: [] },
        },
      ],
    };

    const watchesOnly = filterNwsAlertCollection(collection, {
      showWatches: true,
      showWarnings: false,
      showAdvisories: false,
    });

    expect(watchesOnly.features).toHaveLength(1);
    expect(watchesOnly.features[0]?.properties?.event).toBe('Tornado Watch');
  });

  test('filterNwsAlertCollection always includes statements without advisories toggle', () => {
    const collection = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { event: 'Special Weather Statement' },
          geometry: { type: 'Polygon' as const, coordinates: [] },
        },
      ],
    };

    const filtered = filterNwsAlertCollection(collection, {
      showWatches: false,
      showWarnings: false,
      showAdvisories: false,
    });

    expect(filtered.features).toHaveLength(1);
  });

  test('snapshotCollectionKey returns a bounded digest instead of feature IDs', () => {
    const collection = {
      type: 'FeatureCollection' as const,
      features: Array.from({ length: 500 }, (_, index) => ({
        type: 'Feature' as const,
        id: `alert-${index}`,
        properties: { updated: '2026-08-13T00:00:00Z' },
        geometry: null,
      })),
    } as unknown as NwsAlertFeatureCollection;

    const key = snapshotCollectionKey(collection);
    expect(key).toMatch(/^500:\d+:\d+$/);
    expect(key.length).toBeLessThan(32);
    expect(snapshotCollectionKey(collection)).toBe(key);
  });

  test('compares snapshots independent of alert ordering', () => {
    const makeCollection = (ids: string[]): NwsAlertFeatureCollection => ({
      type: 'FeatureCollection',
      features: ids.map((id) => ({
        type: 'Feature' as const,
        id,
        properties: { updated: '2026-08-13T00:00:00Z' },
        geometry: null,
      })),
    } as unknown as NwsAlertFeatureCollection);

    expect(snapshotCollectionsEqual(makeCollection(['a', 'b']), makeCollection(['b', 'a'])))
      .toBe(true);
    expect(snapshotCollectionsEqual(makeCollection(['a', 'b']), makeCollection(['a', 'c'])))
      .toBe(false);
  });

  test('appends changed alert snapshots once and bounds the animation window', () => {
    const makeCollection = (id: string): NwsAlertFeatureCollection => ({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id,
        properties: { updated: '2026-08-13T00:00:00Z' },
        geometry: null,
      }],
    } as unknown as NwsAlertFeatureCollection);
    const first = makeCollection('first');
    const second = makeCollection('second');
    const third = makeCollection('third');
    const initialFrames = [first];

    expect(appendAlertSnapshotFrame(initialFrames, makeCollection('first'), 2)).toBe(initialFrames);
    expect(appendAlertSnapshotFrame(initialFrames, second, 2)).toEqual([first, second]);
    expect(appendAlertSnapshotFrame([first, second], third, 2)).toEqual([second, third]);
  });

  test('bounds fetched alerts even when the API returns more than the limit', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: Array.from({ length: MAX_ACTIVE_ALERTS + 1 }, (_, index) => ({
          type: 'Feature',
          id: `alert-${index}`,
          properties: {},
          geometry: null,
        })),
      }),
    }) as jest.Mock;

    try {
      await expect(fetchActiveNwsAlerts()).resolves.toMatchObject({
        features: { length: MAX_ACTIVE_ALERTS },
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`limit=${MAX_ACTIVE_ALERTS}`),
        expect.any(Object)
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('does not send a User-Agent header browsers would silently drop', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    }) as jest.Mock;

    try {
      await fetchActiveNwsAlerts();
      const requestInit = (global.fetch as jest.Mock).mock.calls[0]?.[1] as RequestInit | undefined;
      expect(requestInit).toBeDefined();
      expect(new Headers(requestInit?.headers).has('user-agent')).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
