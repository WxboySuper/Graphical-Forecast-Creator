type BetaApiTokenProvider = () => Promise<string | null>;
type TokenProviderWaiter = {
  resolve: (provider: BetaApiTokenProvider) => void;
  reject: (error: Error) => void;
  cleanup?: () => void;
};

let tokenProvider: BetaApiTokenProvider | null = null;
let tokenProviderGeneration = 0;
let tokenProviderWaiters: TokenProviderWaiter[] = [];
const SESSION_INITIALIZING_ERROR = 'The beta session is still initializing.';
const SESSION_SIGNED_OUT_ERROR = 'The beta session is signed out.';
export const isBetaSessionInitializing = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes(SESSION_INITIALIZING_ERROR);
};

/** True only for an explicitly selected beta build using Clerk and D1. */
export const betaClerkPublishableKey = typeof __GFC_CLERK_PUBLISHABLE_KEY__ === 'undefined' ? '' : __GFC_CLERK_PUBLISHABLE_KEY__;
export const isBetaClerkD1Mode = (): boolean => Boolean(
  typeof __GFC_BETA_CLERK_D1__ !== 'undefined' && __GFC_BETA_CLERK_D1__ && betaClerkPublishableKey,
);

/** Registers the active Clerk session token source for non-component data services. */
export const setBetaApiTokenProvider = (provider: BetaApiTokenProvider | null): void => {
  tokenProviderGeneration += 1;
  tokenProvider = provider;
  if (!provider) {
    const waiters = tokenProviderWaiters;
    tokenProviderWaiters = [];
    waiters.forEach(({ reject, cleanup }) => { cleanup?.(); reject(new Error(SESSION_SIGNED_OUT_ERROR)); });
    return;
  }
  const waiters = tokenProviderWaiters;
  tokenProviderWaiters = [];
  waiters.forEach(({ resolve, cleanup }) => { cleanup?.(); resolve(provider); });
};

const waitForTokenProvider = (timeoutMs = 1_000, signal?: AbortSignal): Promise<BetaApiTokenProvider> => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('The beta API request was cancelled.', 'AbortError'));
    return;
  }
  if (tokenProvider) {
    resolve(tokenProvider);
    return;
  }
  const waiter: TokenProviderWaiter = {
    resolve: (provider) => {
    globalThis.clearTimeout(timeout);
    resolve(provider);
    },
    reject: (error) => {
      globalThis.clearTimeout(timeout);
      reject(error);
    },
  };
  const onAbort = () => {
    tokenProviderWaiters = tokenProviderWaiters.filter((pending) => pending !== waiter);
    waiter.cleanup?.();
    reject(new DOMException('The beta API request was cancelled.', 'AbortError'));
  };
  const timeout = globalThis.setTimeout(() => {
    tokenProviderWaiters = tokenProviderWaiters.filter((pending) => pending !== waiter);
    signal?.removeEventListener('abort', onAbort);
    reject(new Error(SESSION_INITIALIZING_ERROR));
  }, timeoutMs);
  waiter.cleanup = () => { globalThis.clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); };
  signal?.addEventListener('abort', onAbort, { once: true });
  tokenProviderWaiters.push(waiter);
});

const withAbort = <T,>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('The beta API request was cancelled.', 'AbortError'));
    return;
  }
  const onAbort = () => reject(new DOMException('The beta API request was cancelled.', 'AbortError'));
  signal?.addEventListener('abort', onAbort, { once: true });
  promise.then(resolve, reject).finally(() => signal?.removeEventListener('abort', onAbort));
});

const readProviderToken = (provider: BetaApiTokenProvider, signal?: AbortSignal) => withAbort(provider(), signal);

const waitForTokenRetry = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('The beta API request was cancelled.', 'AbortError'));
    return;
  }
  const cleanup = () => signal?.removeEventListener('abort', onAbort);
  const timer = globalThis.setTimeout(() => { cleanup(); resolve(); }, 250);
  const onAbort = () => {
    globalThis.clearTimeout(timer);
    cleanup();
    reject(new DOMException('The beta API request was cancelled.', 'AbortError'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
});

/** Waits briefly for a Clerk token, respecting caller cancellation. */
export const getBetaApiToken = async (provider: BetaApiTokenProvider, signal?: AbortSignal): Promise<string> => {
  if (signal?.aborted) throw new DOMException('The beta API request was cancelled.', 'AbortError');
  let token = await readProviderToken(provider, signal);
  for (let attempt = 0; !token && attempt < 4; attempt += 1) {
    await waitForTokenRetry(signal);
    token = await readProviderToken(provider, signal);
  }
  if (!token) throw new Error(SESSION_INITIALIZING_ERROR);
  return token;
};

/** Sends an authenticated request to the same-origin beta Worker API. */
export const fetchBetaApi = async (path: string, init: RequestInit = {}): Promise<Response> => {
  // Child service effects can run before the Clerk provider's parent effect registers the token source.
  const initialGeneration = tokenProviderGeneration;
  const provider = tokenProvider ?? await waitForTokenProvider(1_000, init.signal ?? undefined);
  const requestGeneration = tokenProvider === provider ? tokenProviderGeneration : initialGeneration;
  const token = await getBetaApiToken(provider, init.signal ?? undefined);
  if (!tokenProvider) throw new Error(SESSION_SIGNED_OUT_ERROR);
  if (tokenProvider !== provider) throw new Error(SESSION_SIGNED_OUT_ERROR);
  if (tokenProviderGeneration !== requestGeneration) throw new Error(SESSION_SIGNED_OUT_ERROR);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers });
};
