import type { useAuth } from '../auth/AuthProvider';

export type AccountDeletionReauthentication = 'google' | 'password' | 'session' | 'unsupported';

/** Matches the providers and credentials supported by deleteHostedAccount. */
export const getAccountDeletionReauthentication = (
  user: ReturnType<typeof useAuth>['user'],
  authProvider?: ReturnType<typeof useAuth>['authProvider'],
): AccountDeletionReauthentication => {
  if (!user) return 'unsupported';
  if (authProvider === 'clerk') return 'session';

  const providerIds = new Set(user.providerData.map((provider) => provider.providerId));
  if (providerIds.has('google.com')) return 'google';
  if (providerIds.has('password') && user.email) return 'password';
  return 'unsupported';
};

/** Prevents submitting when no supported provider-specific reauthentication is available. */
export const canSubmitAccountDeletion = (
  confirmation: string,
  reauthentication: AccountDeletionReauthentication,
  password: string,
): boolean => {
  if (confirmation !== 'DELETE' || reauthentication === 'unsupported') return false;
  if (reauthentication === 'google' || reauthentication === 'session') return true;
  return password.length > 0;
};
