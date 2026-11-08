import { renderHook, waitFor } from '@testing-library/react';
import { useMesoscaleLatest, useMesoscaleStatus, selectMesoscaleFrames } from './hooks';
import { getFixtureCatalog } from './fixtures/catalogs';

describe('mesoscale hooks', () => {
  it('aborts the active request on unmount', async () => {
    let requestSignal: AbortSignal | null = null;
    const fetcher = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    const config = { baseUrl: 'https://mesoscale.example.test', fixtures: false, enabled: true };
    const { unmount } = renderHook(() => useMesoscaleLatest('hrrr', { config, fetcher }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    unmount();
    expect((requestSignal as unknown as AbortSignal).aborted).toBe(true);
  });

  it('keeps f00 analysis separate from f01 and later forecast frames', () => {
    const catalog = getFixtureCatalog('hrrr')!;
    const analysis = { ...catalog.frames[0], forecastHour: 0, frameType: 'analysis' as const, validTime: catalog.cycleTime };
    const forecast = { ...catalog.frames[0], forecastHour: 1, frameType: 'forecast' as const, validTime: '2026-05-20T13:00:00Z' };
    const mixed = { ...catalog, frames: [forecast, analysis] };
    expect(selectMesoscaleFrames(mixed, 'analysis').map(frame => frame.forecastHour)).toEqual([0]);
    expect(selectMesoscaleFrames(mixed, 'forecast').map(frame => frame.forecastHour)).toEqual([1]);
  });

  it('marks an invalid status cycle age as unknown and stale', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ status: 'healthy', models: [{ modelId: 'hrrr', latestCycleTime: 'invalid', health: 'complete' }] }),
    });
    const config = { baseUrl: 'https://mesoscale.example.test', fixtures: false, enabled: true };
    const { result } = renderHook(() => useMesoscaleStatus({ config, fetcher }));
    await waitFor(() => expect(result.current).toMatchObject({ state: 'stale', data: { models: [{ ageMinutes: null, stale: true }] } }));
  });
});
