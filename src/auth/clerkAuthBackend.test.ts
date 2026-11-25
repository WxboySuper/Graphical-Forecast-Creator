import { createClerkAuthBackend } from './clerkAuthBackend';
import type { AuthBackendUser } from './AuthBackend';

describe('createClerkAuthBackend', () => {
  it('adapts Clerk identity, token, sign-out, and account deletion to AuthBackend', async () => {
    const user = { uid: 'clerk-user' } as AuthBackendUser;
    const getToken = jest.fn(async () => 'clerk-token');
    const signOut = jest.fn(async () => undefined);
    const deleteAccount = jest.fn(async () => undefined);
    const backend = createClerkAuthBackend({ user, getToken, signOut, deleteAccount });

    expect(backend.provider).toBe('clerk');
    expect(backend.enabled).toBe(true);
    expect(backend.getCurrentUser()).toBe(user);
    await expect(backend.getToken()).resolves.toBe('clerk-token');
    await backend.signOut();
    await backend.deleteAccount(user);

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(deleteAccount).toHaveBeenCalledWith(user);
  });
});
