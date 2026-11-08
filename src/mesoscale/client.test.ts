import { fetchMesoscaleCatalog, fetchMesoscaleLatest, fetchMesoscaleStatus, normalizeCatalogFrame, normalizeMesoscaleCatalog, resolveCycleId, type RequestOptions } from './client';
import { getFixtureCatalog, getFixtureLatest } from './fixtures/catalogs';

const fixtures: RequestOptions = { config: { baseUrl: '/mesoscale-fixtures', fixtures: true, enabled: true } };

describe('mesoscale client', () => {
  it('reads latest, catalog, and status from local fixtures without network access', async () => {
    const fetcher = jest.fn();
    const options = { ...fixtures, fetcher };
    const latest = await fetchMesoscaleLatest({ model: 'hrrr', options });
    expect(latest).toMatchObject({ state: 'stale', data: { modelId: 'hrrr' } });
    const cycle = latest.state === 'stale' ? resolveCycleId(latest.data.cycleTime) : '';
    const catalog = await fetchMesoscaleCatalog({ model: 'hrrr', cycle, options });
    expect(catalog.state).toBe('stale');
    const status = await fetchMesoscaleStatus(options);
    expect(status.state).toBe('partial');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps catalog parameters through the provider normalizer and keeps fixture legend metadata', () => {
    const catalog = getFixtureCatalog('hrrr');
    expect(catalog).not.toBeNull();
    const normalized = normalizeMesoscaleCatalog(catalog!);
    expect(normalized[0].state).toBe('stale');
    if (normalized[0].state === 'stale') expect(normalized[0].parameters[0].definition.units).toBe('J kg-1');
  });

  it('keeps unavailable catalog fields partial instead of filling them in', () => {
    const catalog = getFixtureCatalog('rap');
    expect(catalog).not.toBeNull();
    const result = normalizeCatalogFrame(catalog!, 0, Date.parse('2026-05-20T12:30:00Z'));
    expect(result).toMatchObject({ state: 'partial', unavailableParameters: [{ id: 'cin' }, { id: 'srh' }] });
  });

  it('maps a failed catalog parameter to unavailable data while keeping other fields', () => {
    const catalog = getFixtureCatalog('hrrr')!;
    const frame = catalog.frames[0];
    const failedCatalog = {
      ...catalog,
      frames: [{ ...frame, parameters: frame.parameters.map((parameter, index) => index === 0 ? { ...parameter, status: 'failed' as const } : parameter) }],
    };
    const normalized = normalizeMesoscaleCatalog(failedCatalog, Date.parse('2026-05-20T12:30:00Z'))[0];
    expect(normalized).toMatchObject({ state: 'partial', unavailableParameters: [{ id: 'mlcape' }] });
    if (normalized.state === 'partial') expect(normalized.parameters.map(parameter => parameter.definition.id)).toEqual(['stp', 'scp']);
  });

  it('returns malformed for invalid JSON and upstream-failure for HTTP errors', async () => {
    const malformed = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: () => Promise.reject(new SyntaxError('bad json')) });
    const badJson = await fetchMesoscaleLatest({ model: 'hrrr', options: { fetcher: malformed, config: { ...fixtures.config!, fixtures: false } } });
    expect(badJson.state).toBe('malformed');
    const unavailable = jest.fn().mockResolvedValue({ ok: false, status: 503, headers: new Headers() });
    const failure = await fetchMesoscaleLatest({ model: 'hrrr', options: { fetcher: unavailable, retries: 0, config: { ...fixtures.config!, fixtures: false } } });
    expect(failure).toMatchObject({ state: 'upstream-failure', retryable: true });
  });

  it('keeps missing worker age headers unknown', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => getFixtureLatest('hrrr') });
    const result = await fetchMesoscaleLatest({ model: 'hrrr', options: { fetcher, config: { ...fixtures.config!, fixtures: false } } });
    expect(result).toMatchObject({ state: 'ready', ageMinutes: null });
  });

  it('caps retries and rejects a catalog whose cycle differs from the request', async () => {
    const failed = jest.fn().mockRejectedValue(new TypeError('offline'));
    const result = await fetchMesoscaleLatest({ model: 'hrrr', options: { fetcher: failed, retries: 20, config: { ...fixtures.config!, fixtures: false } } });
    expect(result.state).toBe('upstream-failure');
    expect(failed).toHaveBeenCalledTimes(4);

    const catalog = getFixtureCatalog('hrrr')!;
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => catalog });
    const malformed = await fetchMesoscaleCatalog({ model: 'hrrr', cycle: '20260520T1300Z', options: {
      fetcher,
      config: { ...fixtures.config!, fixtures: false },
    } });
    expect(malformed).toMatchObject({ state: 'malformed', message: 'Catalog cycle does not match the request.' });
  });

  it('rejects invalid tile templates and missing catalog domains', async () => {
    const catalog = getFixtureCatalog('hrrr')!;
    const options = (payload: unknown): RequestOptions => ({
      fetcher: jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => payload }),
      config: { ...fixtures.config!, fixtures: false },
    });
    const cycle = resolveCycleId(catalog.cycleTime);
    const badTemplate = {
      ...catalog,
      frames: catalog.frames.map(frame => ({
        ...frame,
        parameters: frame.parameters.map(parameter => ({ ...parameter, data: { ...parameter.data, urlTemplate: '' } })),
      })),
    };
    await expect(fetchMesoscaleCatalog({ model: 'hrrr', cycle, options: options(badTemplate) }))
      .resolves.toMatchObject({ state: 'malformed' });
    await expect(fetchMesoscaleCatalog({ model: 'hrrr', cycle, options: options({ ...catalog, domain: null }) }))
      .resolves.toMatchObject({ state: 'malformed', message: 'Catalog domain metadata is invalid.' });
    await expect(fetchMesoscaleCatalog({ model: 'hrrr', cycle, options: options({
      ...catalog,
      frames: catalog.frames.map(frame => ({
        ...frame,
        parameters: frame.parameters.map(parameter => ({ ...parameter, source: null })),
      })),
    }) })).resolves.toMatchObject({ state: 'malformed' });
    expect(normalizeCatalogFrame({ ...catalog, domain: null } as never, 0).state).toBe('malformed');
    expect(normalizeMesoscaleCatalog({ ...catalog, domain: null } as never)[0].state).toBe('malformed');
  });
});
