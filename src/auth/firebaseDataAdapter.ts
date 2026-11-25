/** Firebase persistence exports used by hosted client services. */
export {
  collection,
  disableNetwork,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  enableNetwork,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  waitForPendingWrites,
  Timestamp,
} from 'firebase/firestore';
export type {
  DocumentData,
  DocumentReference,
  QuerySnapshot,
  Transaction,
  Unsubscribe,
} from 'firebase/firestore';
export { db, isHostedAuthEnabled, requireDb } from '../lib/firebase';
