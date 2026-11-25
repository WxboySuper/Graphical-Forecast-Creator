import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider, isHostedAuthEnabled, requireAuth } from '../lib/firebase';
import { safeParseJson } from './authCommon';
import type { AuthBackend } from './AuthBackend';

export type FirebaseAuthListener = (user: User | null, error?: Error) => void;

/** Firebase-specific identity operations live behind the shared auth contract. */
export const firebaseAuthBackend: AuthBackend = {
  provider: 'firebase',
  enabled: isHostedAuthEnabled,
  getCurrentUser: () => auth?.currentUser ?? null,
  getToken: async (forceRefresh = false) => auth?.currentUser?.getIdToken(forceRefresh) ?? null,
  signInWithGoogle: async () => {
    const credential = await signInWithPopup(requireAuth(), googleAuthProvider);
    return { user: credential.user, isNewUser: Boolean(getAdditionalUserInfo(credential)?.isNewUser) };
  },
  signInWithEmail: async (email, password) => (await signInWithEmailAndPassword(requireAuth(), email, password)).user,
  signUpWithEmail: async (email, password) => (await createUserWithEmailAndPassword(requireAuth(), email, password)).user,
  signOut: async () => signOut(requireAuth()),
  deleteAccount: async (user, password) => deleteFirebaseAccount(user as User, password),
};

/** Watches Firebase identity changes without exposing Firebase Auth from the provider. */
export const subscribeToFirebaseAuth = (listener: FirebaseAuthListener): (() => void) => {
  if (!isHostedAuthEnabled || !auth) {
    listener(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, (user) => listener(user), (error) => listener(null, error));
};

/** Clears an optional Firebase fixture session used by local auth fixtures. */
export const signOutFirebaseFixture = async (): Promise<void> => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch {
    // Fixture sign-out must still clear the local session if hosted auth is unavailable.
  }
};

const reauthenticateForDeletion = async (user: User, password?: string): Promise<void> => {
  const hasProvider = (providerId: string) => user.providerData.some((provider) => provider.providerId === providerId);
  if (hasProvider('google.com')) {
    await reauthenticateWithPopup(user, googleAuthProvider);
    return;
  }
  if (!hasProvider('password') || !user.email) {
    throw new Error('This sign-in method cannot be reauthenticated here. Contact support for account deletion.');
  }
  if (!password) throw new Error('Enter your current password to delete this account.');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
};

const requestAccountDeletion = async (token: string): Promise<void> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await safeParseJson<{ error?: string }>(response);
      throw new Error(body?.error || 'Unable to delete your account right now.');
    }
  } finally {
    clearTimeout(timeout);
  }
};

const deleteFirebaseAccount = async (user: User, password?: string): Promise<void> => {
  await reauthenticateForDeletion(user, password);
  await requestAccountDeletion(await user.getIdToken(true));
};
