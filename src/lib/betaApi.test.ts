import { fetchBetaApi, getBetaApiToken, setBetaApiTokenProvider } from './betaApi';

describe('beta Worker token provider lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setBetaApiTokenProvider(null);
    jest.useRealTimers();
  });

  it('fails pending API calls immediately when the provider is cleared', async () => {
    jest.useFakeTimers();
    const pending = fetchBetaApi('/api/user/settings');
    const rejection = pending.catch((error: Error) => error);
    setBetaApiTokenProvider(null);
    expect(await rejection).toEqual(expect.objectContaining({ message: 'The beta session is signed out.' }));
  });

  it('times out while waiting for Clerk to register a token provider', async () => {
    jest.useFakeTimers();
    const pending = fetchBetaApi('/api/user/settings');
    const rejection = pending.catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await rejection).toEqual(expect.objectContaining({ message: 'The beta session is still initializing.' }));
  });

  it('discards a token that resolves after the provider is cleared', async () => {
    let resolveToken!: (token: string) => void;
    const provider = () => new Promise<string>((resolve) => { resolveToken = resolve; });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    setBetaApiTokenProvider(provider);
    const pending = fetchBetaApi('/api/user/settings');
    await Promise.resolve();
    setBetaApiTokenProvider(null);
    resolveToken('stale-clerk-token');
    await expect(pending).rejects.toEqual(expect.objectContaining({ message: 'The beta session is signed out.' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shares one bounded token wait and stops polling when aborted', async () => {
    jest.useFakeTimers();
    const provider = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue('clerk-token');
    const pending = getBetaApiToken(provider);
    await jest.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe('clerk-token');

    const controller = new AbortController();
    const noToken = jest.fn().mockResolvedValue(null);
    const cancelled = getBetaApiToken(noToken, controller.signal);
    const rejection = cancelled.catch((error: Error) => error);
    controller.abort();
    await expect(rejection).resolves.toEqual(expect.objectContaining({ name: 'AbortError' }));
  });
});
