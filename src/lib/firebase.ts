import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';

interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const firebaseClientConfig: FirebaseClientConfig = {
  apiKey: __GFC_FIREBASE_API_KEY__ ?? '',
  authDomain: __GFC_FIREBASE_AUTH_DOMAIN__ ?? '',
  projectId: __GFC_FIREBASE_PROJECT_ID__ ?? '',
  appId: __GFC_FIREBASE_APP_ID__ ?? '',
};

/** True when the hosted auth configuration required for Firebase sign-in is present. */
export const isHostedAuthEnabled = Object.values(firebaseClientConfig).every(Boolean);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;

/** Memory cache avoids IndexedDB persistence that Safari can invalidate after sleep. */
function getOrInitFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    return getFirestore(app);
  }
}

if (isHostedAuthEnabled) {
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseClientConfig);
  firebaseAuth = getAuth(firebaseApp);
  firestoreDb = getOrInitFirestore(firebaseApp);

  // Explicitly set persistence to browser local to resolve session drops (GFC-WEB-B).
  setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {
    // Fail silently; fallback to default persistence is handled by SDK.
  });
}

export const app = firebaseApp;
export const auth = firebaseAuth;
export const db = firestoreDb;
export const googleAuthProvider = new GoogleAuthProvider();

/** Ensure Firebase Auth is initialized and return the Auth instance or throw a clear error. */
export function requireAuth(): Auth {
  if (!auth) {
    throw new Error('Firebase auth is not configured. Ensure hosted auth is enabled.');
  }
  return auth;
}

/** Ensure Firestore is initialized and return the Firestore instance or throw a clear error. */
export function requireDb(): Firestore {
  if (!db) {
    throw new Error('Firestore is not configured. Ensure hosted features are enabled.');
  }
  return db;
}
