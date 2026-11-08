import { MESOSCALE_CURRENT_CONDITIONS_PREFERENCE, type MesoscaleLatestCycleResolution } from './contracts';
import { normalizeProviderPayload } from './normalizeProviderPayload';

const fixtures = {
  complete: require('./fixtures/complete.json') as unknown,
  partial: require('./fixtures/partial.json') as unknown,
  stale: require('./fixtures/stale.json') as unknown,
  malformed: require('./fixtures/malformed.json') as unknown,
  upstreamFailure: require('./fixtures/upstream-failure.json') as unknown,
};

describe('normalizeProviderPayload', () => {
  it('preserves model, cycle, forecast-hour, valid-time, domain, units, and level context', () => {
    const result = normalizeProviderPayload(fixtures.complete);

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.model.id).toBe('hrrr');
    expect(result.cycleTime).toBe('2026-05-20T12:00:00Z');
    expect(result.forecastHour).toBe(3);
    expect(result.forecastHourLabel).toBe('f03');
    expect(result.frameType).toBe('forecast');
    expect(result.validTime).toBe('2026-05-20T15:00:00Z');
    expect(result.domain.bounds).toEqual([-125, 24, -66, 50]);
    expect(result.parameters[0].definition.units).toBe('J kg-1');
    expect(result.parameters[0].definition.level).toEqual({
      type: 'layer', label: 'Mixed layer', top: 0, bottom: 100, units: 'hPa',
    });
  });

  it('passes provider supplied STP and SCP values through unchanged', () => {
    const result = normalizeProviderPayload(fixtures.complete);
    if (result.state !== 'ready') throw new Error('Expected a complete response.');

    expect(result.parameters.find(parameter => parameter.definition.id === 'stp')?.data).toEqual([[0, 0.4, 1.2]]);
    expect(result.parameters.find(parameter => parameter.definition.id === 'scp')?.data).toEqual([[0.2, 1.5, 4.25]]);
  });

  it('reports omitted requested fields as unavailable and marks the response partial', () => {
    const result = normalizeProviderPayload(fixtures.partial);

    expect(result.state).toBe('partial');
    if (result.state !== 'partial') return;
    expect(result.frameType).toBe('analysis');
    expect(result.forecastHourLabel).toBe('f00');
    expect(result.parameters.map(parameter => parameter.definition.id)).toEqual(['cape']);
    expect(result.unavailableParameters).toEqual([
      { id: 'cin', reason: 'Not available for this cycle.' },
      { id: 'srh', reason: 'Not supplied by provider.' },
    ]);
  });

  it('marks old provider responses stale without dropping their data', () => {
    const providerStale = normalizeProviderPayload(fixtures.stale);
    expect(providerStale.state).toBe('stale');

    const result = normalizeProviderPayload({
      ...(fixtures.stale as Record<string, unknown>),
      stale: false,
    }, {
      now: new Date('2026-05-20T13:12:00Z'),
      staleAfterMs: 60 * 60 * 1000,
    });

    expect(result.state).toBe('stale');
    if (result.state !== 'stale') return;
    expect(result.stale).toBe(true);
    expect(result.ageMs).toBe(72 * 60 * 1000);
    expect(result.parameters[0].data).toEqual([[12, 20, 35]]);
  });

  it('returns malformed when required temporal metadata is invalid', () => {
    expect(normalizeProviderPayload(fixtures.malformed)).toMatchObject({
      state: 'malformed',
      message: 'Cycle time must be a valid timestamp.',
    });
  });

  it('rejects timestamps without explicit timezones', () => {
    const timezoneLess = {
      ...(fixtures.complete as Record<string, unknown>),
      cycleTime: '2026-05-20T12:00:00',
    };

    expect(normalizeProviderPayload(timezoneLess)).toMatchObject({
      state: 'malformed',
      message: 'Cycle time must be a valid timestamp.',
    });
  });

  it('rejects a valid time that conflicts with the model cycle and forecast hour', () => {
    const inconsistent = {
      ...(fixtures.complete as Record<string, unknown>),
      validTime: '2026-05-20T18:00:00Z',
    };

    expect(normalizeProviderPayload(inconsistent)).toMatchObject({
      state: 'malformed',
      message: 'Valid time must equal cycle time plus forecast hour.',
    });
  });

  it('preserves upstream failure details and exposes loading explicitly', () => {
    expect(normalizeProviderPayload(fixtures.upstreamFailure)).toEqual({
      state: 'upstream-failure',
      message: 'Provider timed out while retrieving the requested cycle.',
      retryable: true,
    });
    expect(normalizeProviderPayload({ state: 'loading' })).toEqual({ state: 'loading' });
  });

  it('rejects duplicate field identities instead of choosing one silently', () => {
    const duplicated = {
      ...(fixtures.complete as Record<string, unknown>),
      parameters: [
        ...((fixtures.complete as { parameters: unknown[] }).parameters),
        (fixtures.complete as { parameters: unknown[] }).parameters[0],
      ],
    };

    expect(normalizeProviderPayload(duplicated).state).toBe('malformed');
  });

  it('supports distinct HRRR, RAP, and RRFS capability records', () => {
    for (const id of ['hrrr', 'rap', 'rrfs'] as const) {
      const response = normalizeProviderPayload({
        ...(fixtures.complete as Record<string, unknown>),
        model: {
          id,
          name: id.toUpperCase(),
          capabilities: { availableParameterIds: ['mlcape', 'stp', 'scp'], maxForecastHour: 48, cycleCadenceMinutes: 60 },
        },
      });
      expect(response.state).toBe('ready');
      if (response.state === 'ready') expect(response.model.id).toBe(id);
    }
  });

  it('models a latest cycle that has not been published yet', () => {
    const resolution: MesoscaleLatestCycleResolution = {
      state: 'not-yet-available',
      modelId: 'hrrr',
      expectedCycleTime: '2026-05-20T12:00:00Z',
      latestAvailableCycleTime: '2026-05-20T11:00:00Z',
      nextCheckAfterMs: 5 * 60 * 1000,
    };
    expect(resolution.state).toBe('not-yet-available');
    expect(MESOSCALE_CURRENT_CONDITIONS_PREFERENCE).toEqual({
      modelId: 'hrrr', frameType: 'analysis', forecastHour: 0, cycle: 'latest-available',
    });
  });
});
