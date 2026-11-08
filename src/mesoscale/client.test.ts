import { fetchMesoscaleCatalog, fetchMesoscaleLatest, fetchMesoscaleStatus, normalizeCatalogFrame, normalizeMesoscaleCatalog, resolveCycleId, type RequestOptions } from './client';
import { getFixtureCatalog } from './fixtures/catalogs';

const fixtures: RequestOptions = { config: { baseUrl: '/mesoscale-fixtures', fixtures: true, enabled: true } };

describe('mesoscale client', () => {
  it('reads latest, catalog, and status from local fixtures without network access', async () => {
    const fetcher = jest.fn();
    const options = { ...fixtures, fetcher };
    const latest = await fetchMesoscaleLatest('hrrr', options);
    expect(latest).toMatchObject({ state: 'stale', data: { modelId: 'hrrr' } });
    const cycle = latest.state === 'stale' ? resolveCycleId(latest.data.cycleTime) : '';
    const catalog = await fetchMesoscaleCatalog('hrrr', cycle, options);
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

  it('returns malformed for invalid JSON and upstream-failure for HTTP errors', async () => {
    const malformed = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: () => Promise.reject(new SyntaxError('bad json')) });
    const badJson = await fetchMesoscaleLatest('hrrr', { fetcher: malformed, config: { ...fixtures.config!, fixtures: false } });
    expect(badJson.state).toBe('malformed');
    const unavailable = jest.fn().mockResolvedValue({ ok: false, status: 503, headers: new Headers() });
    const failure = await fetchMesoscaleLatest('hrrr', { fetcher: unavailable, retries: 0, config: { ...fixtures.config!, fixtures: false } });
    expect(failure).toMatchObject({ state: 'upstream-failure', retryable: true });
  });

  it('caps retries and rejects a catalog whose cycle differs from the request', async () => {
    const failed = jest.fn().mockRejectedValue(new TypeError('offline'));
    const result = await fetchMesoscaleLatest('hrrr', { fetcher: failed, retries: 20, config: { ...fixtures.config!, fixtures: false } });
    expect(result.state).toBe('upstream-failure');
    expect(failed).toHaveBeenCalledTimes(4);

    const catalog = getFixtureCatalog('hrrr')!;
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => catalog });
    const malformed = await fetchMesoscaleCatalog('hrrr', '20260520T1300Z', {
      fetcher,
      config: { ...fixtures.config!, fixtures: false },
    });
    expect(malformed).toMatchObject({ state: 'malformed', message: 'Catalog cycle does not match the request.' });
  });
});
