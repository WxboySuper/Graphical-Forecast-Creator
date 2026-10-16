import { fetchBetaApi, setBetaApiTokenProvider } from './betaApi';

describe('beta Worker token provider lifecycle', () => {
  afterEach(() => {
    setBetaApiTokenProvider(null);
    jest.useRealTimers();
  });

  it('keeps pending API calls waiting while the provider is temporarily cleared', async () => {
    jest.useFakeTimers();
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);
    const pending = fetchBetaApi('/api/user/settings');
    setBetaApiTokenProvider(null);
    await jest.advanceTimersByTimeAsync(1_000);
    setBetaApiTokenProvider(async () => 'beta-token');
    const response = await pending;
    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer beta-token');
  });

  it('times out while waiting for Clerk to register a token provider', async () => {
    jest.useFakeTimers();
    const pending = fetchBetaApi('/api/user/settings');
    const rejection = pending.catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(await rejection).toEqual(expect.objectContaining({ message: 'The beta session is still initializing.' }));
  });
});
