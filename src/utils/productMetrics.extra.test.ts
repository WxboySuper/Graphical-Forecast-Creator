describe('productMetrics extra', () => {
  test('recordProductMetric stores installation id and calls fetch', async () => {
    jest.resetModules();
    jest.doMock('../lib/firebase', () => ({ isHostedAuthEnabled: true }));

    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true }));

    // ensure no existing id
    window.localStorage.removeItem('gfcInstallationId');

    const { recordProductMetric } = require('./productMetrics');

    await recordProductMetric({ event: 'cycle_saved' });

    expect((global as any).fetch).toHaveBeenCalled();
    const bodyStr = (global as any).fetch.mock.calls[0][1].body;
    const parsed = JSON.parse(bodyStr);
    expect(parsed.event).toBe('cycle_saved');
    expect(typeof window.localStorage.getItem('gfcInstallationId')).toBe('string');
  });

  test('recordProductMetric sends Authorization header when user present', async () => {
    jest.resetModules();
    jest.doMock('../lib/firebase', () => ({ isHostedAuthEnabled: true }));

    const fakeUser = { getIdToken: jest.fn(() => Promise.resolve('tok-abc')) };
    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true }));

    const { recordProductMetric } = require('./productMetrics');

    await recordProductMetric({ event: 'discussion_saved', user: fakeUser });

    expect((global as any).fetch).toHaveBeenCalled();
    const opts = (global as any).fetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe('Bearer tok-abc');
  });
});
