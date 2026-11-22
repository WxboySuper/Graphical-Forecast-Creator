import type { useAuth } from '../auth/AuthProvider';
import {
  canSubmitAccountDeletion,
  getAccountDeletionReauthentication,
} from './accountDeletionUtils';

const userWithProviders = (
  providerIds: string[],
  email: string | null = 'user@example.com',
): NonNullable<ReturnType<typeof useAuth>['user']> => ({
  email,
  providerData: providerIds.map((providerId) => ({ providerId })),
} as NonNullable<ReturnType<typeof useAuth>['user']>);

describe('accountDeletionUtils', () => {
  test('supports Google popup reauthentication, including linked password accounts', () => {
    expect(getAccountDeletionReauthentication(userWithProviders(['google.com']))).toBe('google');
    expect(getAccountDeletionReauthentication(userWithProviders(['password', 'google.com']))).toBe('google');
  });

  test('supports password reauthentication only when the account has an email', () => {
    expect(getAccountDeletionReauthentication(userWithProviders(['password']))).toBe('password');
    expect(getAccountDeletionReauthentication(userWithProviders(['password'], null))).toBe('unsupported');
  });

  test('marks unsupported and missing users as requiring support', () => {
    expect(getAccountDeletionReauthentication(userWithProviders(['github.com']))).toBe('unsupported');
    expect(getAccountDeletionReauthentication(null)).toBe('unsupported');
  });

  test('allows deletion only with confirmation and supported provider credentials', () => {
    expect(canSubmitAccountDeletion('DELETE', 'google', '')).toBe(true);
    expect(canSubmitAccountDeletion('DELETE', 'password', 'current-password')).toBe(true);
    expect(canSubmitAccountDeletion('DELETE', 'password', '')).toBe(false);
    expect(canSubmitAccountDeletion('DELETE', 'unsupported', '')).toBe(false);
    expect(canSubmitAccountDeletion('delete', 'google', '')).toBe(false);
  });
});
