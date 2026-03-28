import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

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

if (isHostedAuthEnabled) {
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseClientConfig);
  firebaseAuth = getAuth(firebaseApp);
  firestoreDb = getFirestore(firebaseApp);
}

export const app = firebaseApp;
export const auth = firebaseAuth;
export const db = firestoreDb;
export const googleAuthProvider = new GoogleAuthProvider();
