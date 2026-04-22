type FetchMock = jest.Mock<Promise<{ ok: boolean }>, [RequestInfo | URL, RequestInit?]>;

describe('productMetrics extra', () => {
  test('recordProductMetric stores installation id and calls fetch', async () => {
    jest.resetModules();
    jest.doMock('../lib/firebase', () => ({ isHostedAuthEnabled: true }));

    const fetchMock: FetchMock = jest.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    window.localStorage.removeItem('gfcInstallationId');

    const { recordProductMetric } = await import('./productMetrics');

    await recordProductMetric({ event: 'cycle_saved' });

    expect(fetchMock).toHaveBeenCalled();
    const bodyStr = (fetchMock.mock.calls[0]?.[1] as RequestInit & { body: string }).body;
    const parsed = JSON.parse(bodyStr);
    expect(parsed.event).toBe('cycle_saved');
    expect(typeof window.localStorage.getItem('gfcInstallationId')).toBe('string');
  });

  test('recordProductMetric sends Authorization header when user present', async () => {
    jest.resetModules();
    jest.doMock('../lib/firebase', () => ({ isHostedAuthEnabled: true }));

    const fakeUser = { getIdToken: jest.fn(() => Promise.resolve('tok-abc')) };
    const fetchMock: FetchMock = jest.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { recordProductMetric } = await import('./productMetrics');

    await recordProductMetric({ event: 'discussion_saved', user: fakeUser });

    expect(fetchMock).toHaveBeenCalled();
    const opts = fetchMock.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> };
    expect(opts.headers.Authorization).toBe('Bearer tok-abc');
  });
});
