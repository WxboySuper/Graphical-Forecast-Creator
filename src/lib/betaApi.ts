type BetaApiTokenProvider = () => Promise<string | null>;

let tokenProvider: BetaApiTokenProvider | null = null;

/** True only for an explicitly selected beta build using Clerk and D1. */
export const betaClerkPublishableKey = typeof __GFC_CLERK_PUBLISHABLE_KEY__ === 'undefined' ? '' : __GFC_CLERK_PUBLISHABLE_KEY__;
export const isBetaClerkD1Mode = (): boolean => Boolean(
  typeof __GFC_BETA_CLERK_D1__ !== 'undefined' && __GFC_BETA_CLERK_D1__ && betaClerkPublishableKey,
);

/** Registers the active Clerk session token source for non-component data services. */
export const setBetaApiTokenProvider = (provider: BetaApiTokenProvider | null): void => {
  tokenProvider = provider;
};

/** Sends an authenticated request to the same-origin beta Worker API. */
export const fetchBetaApi = async (path: string, init: RequestInit = {}): Promise<Response> => {
  if (!tokenProvider) throw new Error('The beta session is still initializing.');
  const token = await tokenProvider();
  if (!token) throw new Error('A signed-in beta session is required.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers });
};
