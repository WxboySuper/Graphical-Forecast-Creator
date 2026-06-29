import {
  areTstmFeaturesEqual,
  canGenerateTstmForDay,
  getTstmRequestIdentity,
  isCurrentTstmRequest,
  normalizeGeneratedTstmFeatures,
  parseTstmGenerationResponse,
  requestTstmGeneration,
} from './tstmGeneration';
import {
  isServerCapabilityAvailable,
  resetServerCapabilityStatusState,
} from '../config/serverCapabilityStatus';

describe('tstmGeneration utilities', () => {
  afterEach(() => {
    resetServerCapabilityStatusState();
  });

  test('limits SPC calibrated thunder generation to day 1 and day 2', () => {
    expect(canGenerateTstmForDay(1)).toBe(true);
    expect(canGenerateTstmForDay(2)).toBe(true);
    expect(canGenerateTstmForDay(3)).toBe(false);
  });

  test('normalizes generated polygons into editable categorical TSTM features', () => {
    const [feature] = normalizeGeneratedTstmFeatures([
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
        properties: { source: 'spc-href' },
      },
    ]);

    expect(feature.properties).toMatchObject({
      outlookType: 'categorical',
      probability: 'TSTM',
      isSignificant: false,
      derivedFrom: 'spc-href-calibrated-thunder',
    });
    expect(feature.id).toBe('generated-tstm-0');
  });

  test('keeps existing feature ids and accepts multipolygons', () => {
    const [feature] = normalizeGeneratedTstmFeatures([
      {
        type: 'Feature',
        id: 'cached-guidance-1',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
        },
        properties: {},
      },
    ]);

    expect(feature.id).toBe('cached-guidance-1');
    expect(feature.geometry.type).toBe('MultiPolygon');
  });

  test('drops non-polygon guidance instead of placing it in forecast state', () => {
    const features = normalizeGeneratedTstmFeatures([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {},
      },
    ]);

    expect(features).toEqual([]);
  });

  test('compares equivalent features without depending on property key order', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    };
    const left = [{ type: 'Feature' as const, geometry, properties: { source: 'spc', probability: 'TSTM' } }];
    const right = [{ type: 'Feature' as const, geometry, properties: { probability: 'TSTM', source: 'spc' } }];

    expect(areTstmFeaturesEqual(left, right)).toBe(true);
  });

  test('distinguishes stale results when cycle, day, or validity changes', () => {
    const request = {
      day: 1 as const,
      cycleDate: '2026-06-13',
      issueDate: '2026-06-13T06:00:00Z',
      validDate: '2026-06-13T12:00:00Z',
    };
    expect(getTstmRequestIdentity(request)).toContain('day-1');
    expect(isCurrentTstmRequest(request, { ...request })).toBe(true);
    expect(isCurrentTstmRequest(request, { ...request, day: 2 })).toBe(false);
    expect(isCurrentTstmRequest(request, { ...request, cycleDate: '2026-06-14' })).toBe(false);
    expect(isCurrentTstmRequest(request, { ...request, issueDate: '2026-06-13T09:00:00Z' })).toBe(false);
  });

  test('normalizes a valid server response and rejects malformed payloads', () => {
    const response = parseTstmGenerationResponse({
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: {},
      }],
      run: '2026-06-13T12:00:00Z',
      forecastHours: [24],
      effectiveStart: '2026-06-13T12:00:00Z',
      effectiveEnd: '2026-06-14T12:00:00Z',
      warnings: [],
    });
    expect(response.features[0].properties).toMatchObject({ probability: 'TSTM' });
    expect(response.domain).toBe('conus');
    const malformedThresholds = parseTstmGenerationResponse({
      ...response,
      thresholds: {} as never,
    });
    expect(malformedThresholds.thresholds).toEqual({
      calibratedThunderCoreProbability: 0.3,
      calibratedThunderSupportProbability: 0.1,
    });
    expect(() => parseTstmGenerationResponse({ features: [] })).toThrow(/invalid response/);
  });

  test('requests guidance and surfaces structured server errors', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [],
          run: '2026-06-13T12:00:00Z',
          forecastHours: [24],
          effectiveStart: '2026-06-13T12:00:00Z',
          effectiveEnd: '2026-06-14T12:00:00Z',
          warnings: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Auto-TSTM is not enabled on this deployment.' }),
      }) as jest.Mock;
    try {
      await expect(requestTstmGeneration({ day: 1, cycleDate: '2026-06-13' }))
        .resolves.toMatchObject({ features: [] });
      await expect(requestTstmGeneration({ day: 1, cycleDate: '2026-06-13' }))
        .rejects.toThrow(/not enabled/);
      expect(
        isServerCapabilityAvailable('TSTM_GENERATION_ENABLED', {
          loaded: true,
          capabilities: {
            TSTM_GENERATION_ENABLED: {
              available: true,
              reason: 'available',
            },
          },
        })
      ).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
