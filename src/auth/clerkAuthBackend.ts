import type { AuthBackend, AuthBackendUser } from './AuthBackend';

export interface ClerkAuthBackendBindings {
  user: AuthBackendUser | null;
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: (user: AuthBackendUser, password?: string) => Promise<void>;
}

/** Adapts the active Clerk hook bindings to the shared hosted-auth contract. */
export const createClerkAuthBackend = (bindings: ClerkAuthBackendBindings): AuthBackend => ({
  provider: 'clerk',
  enabled: true,
  getCurrentUser: () => bindings.user,
  getToken: bindings.getToken,
  // Clerk owns interactive sign-in through its SignIn/SignUp UI components.
  signInWithGoogle: async () => { throw new Error('Use the beta sign-in form to sign in.'); },
  signInWithEmail: async () => { throw new Error('Use the beta sign-in form to sign in.'); },
  signUpWithEmail: async () => { throw new Error('Use the beta sign-up form to create an account.'); },
  signOut: bindings.signOut,
  deleteAccount: bindings.deleteAccount,
});

/** Clerk and D1 beta API adapter used by non-React app services. */
export {
  betaClerkPublishableKey,
  fetchBetaApi,
  getBetaApiToken,
  isBetaClerkD1Mode,
  isBetaSessionInitializing,
  setBetaApiTokenProvider,
} from '../lib/betaApi';
