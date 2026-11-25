/** Provider-neutral identity details consumed by the application. */
export interface AuthBackendUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerData: Array<{ providerId: string }>;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reload: () => Promise<void>;
  toJSON: () => object;
}

/** The application-facing operations supplied by each hosted identity backend. */
export interface AuthBackend {
  readonly provider: 'firebase' | 'clerk';
  readonly enabled: boolean;
  getCurrentUser: () => AuthBackendUser | null;
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  signInWithGoogle: () => Promise<{ user: AuthBackendUser; isNewUser: boolean }>;
  signInWithEmail: (email: string, password: string) => Promise<AuthBackendUser>;
  signUpWithEmail: (email: string, password: string) => Promise<AuthBackendUser>;
  signOut: () => Promise<void>;
  deleteAccount: (user: AuthBackendUser, password?: string) => Promise<void>;
}
