type BetaApiTokenProvider = () => Promise<string | null>;

let tokenProvider: BetaApiTokenProvider | null = null;
let tokenProviderWaiters: Array<(provider: BetaApiTokenProvider) => void> = [];
const SESSION_INITIALIZING_ERROR = 'The beta session is still initializing.';

/** True only for an explicitly selected beta build using Clerk and D1. */
export const betaClerkPublishableKey = typeof __GFC_CLERK_PUBLISHABLE_KEY__ === 'undefined' ? '' : __GFC_CLERK_PUBLISHABLE_KEY__;
export const isBetaClerkD1Mode = (): boolean => Boolean(
  typeof __GFC_BETA_CLERK_D1__ !== 'undefined' && __GFC_BETA_CLERK_D1__ && betaClerkPublishableKey,
);

/** Registers the active Clerk session token source for non-component data services. */
export const setBetaApiTokenProvider = (provider: BetaApiTokenProvider | null): void => {
  tokenProvider = provider;
  if (!provider) return;
  const waiters = tokenProviderWaiters;
  tokenProviderWaiters = [];
  waiters.forEach((resolve) => resolve(provider));
};

const waitForTokenProvider = (timeoutMs = 5_000): Promise<BetaApiTokenProvider> => new Promise((resolve, reject) => {
  const waiter = (provider: BetaApiTokenProvider) => {
    globalThis.clearTimeout(timeout);
    resolve(provider);
  };
  const timeout = globalThis.setTimeout(() => {
    tokenProviderWaiters = tokenProviderWaiters.filter((pending) => pending !== waiter);
    reject(new Error(SESSION_INITIALIZING_ERROR));
  }, timeoutMs);
  tokenProviderWaiters.push(waiter);
});

/** Sends an authenticated request to the same-origin beta Worker API. */
export const fetchBetaApi = async (path: string, init: RequestInit = {}): Promise<Response> => {
  // Child service effects can run before the Clerk provider's parent effect registers the token source.
  const provider = tokenProvider ?? await waitForTokenProvider();
  const token = await provider();
  if (!token) throw new Error(SESSION_INITIALIZING_ERROR);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers });
};
