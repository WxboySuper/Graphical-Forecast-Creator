import { fetchBetaApi, setBetaApiTokenProvider } from './betaApi';

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
    await jest.advanceTimersByTimeAsync(5_000);
    expect(await rejection).toEqual(expect.objectContaining({ message: 'The beta session is still initializing.' }));
  });
});
