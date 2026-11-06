import type { useAuth } from '../auth/AuthProvider';

export type AccountDeletionReauthentication = 'google' | 'password' | 'unsupported';

/** Matches the providers and credentials supported by deleteHostedAccount. */
export const getAccountDeletionReauthentication = (
  user: ReturnType<typeof useAuth>['user'],
): AccountDeletionReauthentication => {
  if (!user) return 'unsupported';

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
  if (reauthentication === 'google') return true;
  return password.length > 0;
};
