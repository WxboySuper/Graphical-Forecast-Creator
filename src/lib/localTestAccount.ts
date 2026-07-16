export type LocalTestAccountTier = 'free' | 'premium';

const LOCAL_TEST_ACCOUNT_STORAGE_KEY = 'gfc-local-test-account';

/** Keeps test-account fixtures out of production/staging builds even when served from a local hostname. */
export const isLocalTestAccountEnabled = (hostname: string, developmentMode: boolean): boolean =>
  developmentMode && ['localhost', '127.0.0.1'].includes(hostname);

/** Returns the disposable local account fixture requested by the browser URL. */
export const readLocalTestAccount = (): LocalTestAccountTier | null => {
  if (typeof window === 'undefined' || !isLocalTestAccountEnabled(window.location.hostname, __GFC_DEV_MODE__)) {
    return null;
  }

  const queryTier = new URLSearchParams(window.location.search).get('localTestAccount');
  if (queryTier === 'free' || queryTier === 'premium') {
    window.sessionStorage.setItem(LOCAL_TEST_ACCOUNT_STORAGE_KEY, queryTier);
    return queryTier;
  }

  const storedTier = window.sessionStorage.getItem(LOCAL_TEST_ACCOUNT_STORAGE_KEY);
  return storedTier === 'free' || storedTier === 'premium' ? storedTier : null;
};

/** Clears the disposable fixture so a developer can return to normal local or hosted auth. */
export const clearLocalTestAccount = (): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(LOCAL_TEST_ACCOUNT_STORAGE_KEY);
};

/** Builds the stable identity used by the disposable local account fixture. */
export const createLocalTestUser = (tier: LocalTestAccountTier) => ({
  uid: `local-test-${tier}`,
  email: `${tier}@local.test`,
  displayName: `Local ${tier} test account`,
  photoURL: null,
  providerData: [],
  isAnonymous: false,
});
