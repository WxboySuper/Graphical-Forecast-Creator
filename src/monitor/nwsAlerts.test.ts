import {
  classifyNwsAlert,
  filterNwsAlertCollection,
  snapshotCollectionKey,
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
    };

    const key = snapshotCollectionKey(collection);
    expect(key).toMatch(/^500:\d+$/);
    expect(key.length).toBeLessThan(20);
  });
});
