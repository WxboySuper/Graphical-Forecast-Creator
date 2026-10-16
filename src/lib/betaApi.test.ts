import { fetchBetaApi, setBetaApiTokenProvider } from './betaApi';

describe('beta Worker token provider lifecycle', () => {
  afterEach(() => {
    setBetaApiTokenProvider(null);
    jest.useRealTimers();
  });

  it('rejects pending API calls with a retryable initialization error when the provider clears', async () => {
    const pending = fetchBetaApi('/api/user/settings');
    setBetaApiTokenProvider(null);
    await expect(pending).rejects.toThrow('The beta session is still initializing.');
  });

  it('times out while waiting for Clerk to register a token provider', async () => {
    jest.useFakeTimers();
    const pending = fetchBetaApi('/api/user/settings');
    const rejection = pending.catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(await rejection).toEqual(expect.objectContaining({ message: 'The beta session is still initializing.' }));
  });
});
