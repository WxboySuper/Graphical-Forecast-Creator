import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'gfc-rules-test';
const ALICE = 'alice';
const BOB = 'bob';
let testEnv = null;

/** Build a valid client-managed profile document. */
const profile = (overrides = {}) => ({
  email: 'alice@example.test',
  displayName: 'Alice',
  photoURL: '',
  providers: ['password'],
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  ...overrides,
});

/** Build a valid hosted cloud-cycle document. */
const cloudCycle = (overrides = {}) => ({
  id: 'cycle-1',
  userId: ALICE,
  label: 'July 16 cycle',
  cycleDate: '2026-07-16',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  forecastDays: 3,
  totalOutlooks: 1,
  totalFeatures: 1,
  isReadOnly: false,
  payloadJson: '{}',
  payloadBytes: 2,
  ...overrides,
});

/** Return a Firestore client authenticated as the supplied user. */
const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();
/** Return an unauthenticated Firestore client. */
const anonymousDb = () => testEnv.unauthenticatedContext().firestore();

/** Seed trusted server-owned state without applying client rules. */
const seed = async (writes) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await writes(context.firestore());
  });
};

/** Seed a server-owned premium entitlement. */
const setEntitlement = (db, uid, premiumActive) =>
  setDoc(doc(db, 'userEntitlements', uid), { premiumActive });

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe('userProfiles authorization', () => {
  test('allows an owner to create ordinary profile fields', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile()));
  });

  test('rejects privileged and unknown fields on owner create', async () => {
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile({ betaAccess: true }))
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile({ role: 'admin' }))
    );
  });

  test('preserves server-owned access fields during ordinary owner updates', async () => {
    await seed((db) =>
      setDoc(doc(db, 'userProfiles', ALICE), {
        ...profile(),
        betaAccess: true,
        betaGrantedAt: '2026-07-16T00:00:00.000Z',
        betaInviteSource: 'discord',
      })
    );

    await assertSucceeds(
      updateDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), {
        displayName: 'Updated Alice',
        updatedAt: '2026-07-16T01:00:00.000Z',
      })
    );
    const snapshot = await getDoc(doc(dbFor(ALICE), 'userProfiles', ALICE));
    assert.equal(snapshot.data().betaAccess, true);
  });

  test('rejects owner attempts to change reserved access fields', async () => {
    await seed((db) =>
      setDoc(doc(db, 'userProfiles', ALICE), { ...profile(), betaAccess: true })
    );

    await assertFails(
      updateDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), { betaAccess: false })
    );
    await assertFails(
      updateDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), { admin: true })
    );
  });

  test('rejects cross-account profile reads and writes', async () => {
    await seed((db) => setDoc(doc(db, 'userProfiles', ALICE), profile()));
    await assertFails(getDoc(doc(dbFor(BOB), 'userProfiles', ALICE)));
    await assertFails(setDoc(doc(dbFor(BOB), 'userProfiles', ALICE), profile()));
  });
});

describe('cloudCycles entitlement boundary', () => {
  test('rejects client writes to server-owned entitlement records', async () => {
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userEntitlements', ALICE), { premiumActive: true })
    );
    await seed((db) => setEntitlement(db, ALICE, false));
    await assertFails(
      updateDoc(doc(dbFor(ALICE), 'userEntitlements', ALICE), { premiumActive: true })
    );
    await assertFails(deleteDoc(doc(dbFor(ALICE), 'userEntitlements', ALICE)));
  });

  test('rejects creation and mutation of the legacy userSettings cloud store', async () => {
    const settingsRef = doc(dbFor(ALICE), 'userSettings', ALICE);

    await assertFails(
      setDoc(settingsRef, {
        darkMode: false,
        cloudCycles: { 'cycle-1': cloudCycle() },
      })
    );

    await seed((db) =>
      setDoc(doc(db, 'userSettings', ALICE), {
        darkMode: false,
        cloudCycles: { 'cycle-1': cloudCycle() },
      })
    );
    await assertFails(
      updateDoc(settingsRef, {
        cloudCycles: { 'cycle-1': cloudCycle({ label: 'mutated' }) },
      })
    );
  });

  test('allows an owner to remove a pre-existing legacy cloud store during migration', async () => {
    await seed((db) =>
      setDoc(doc(db, 'userSettings', ALICE), {
        darkMode: false,
        cloudCycles: { 'cycle-1': cloudCycle() },
      })
    );

    await assertSucceeds(
      updateDoc(doc(dbFor(ALICE), 'userSettings', ALICE), {
        cloudCycles: deleteField(),
      })
    );
  });

  test('rejects signed-out, free, inactive, and wrong-owner creates', async () => {
    await seed(async (db) => {
      await setEntitlement(db, ALICE, false);
      await setEntitlement(db, BOB, true);
    });

    await assertFails(
      setDoc(doc(anonymousDb(), 'cloudCycles', 'cycle-1'), cloudCycle())
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'cloudCycles', 'cycle-1'), cloudCycle())
    );
    await assertFails(
      setDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1'), cloudCycle())
    );
  });

  test('allows an actively entitled owner to create and update', async () => {
    await seed((db) => setEntitlement(db, ALICE, true));
    const ref = doc(dbFor(ALICE), 'cloudCycles', 'cycle-1');

    await assertSucceeds(setDoc(ref, cloudCycle()));
    await assertSucceeds(
      updateDoc(ref, {
        label: 'Updated cycle',
        updatedAt: '2026-07-16T01:00:00.000Z',
      })
    );
  });

  test('lets a downgraded owner read and delete but not update existing data', async () => {
    await seed(async (db) => {
      await setEntitlement(db, ALICE, false);
      await setDoc(doc(db, 'cloudCycles', 'cycle-1'), cloudCycle());
    });
    const ref = doc(dbFor(ALICE), 'cloudCycles', 'cycle-1');

    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, { label: 'Unauthorized update' }));
    await assertSucceeds(deleteDoc(ref));
  });

  test('rejects anonymous and wrong-owner access to existing cloud cycles', async () => {
    await seed(async (db) => {
      await setEntitlement(db, BOB, true);
      await setDoc(doc(db, 'cloudCycles', 'cycle-1'), cloudCycle());
    });

    await assertFails(getDoc(doc(anonymousDb(), 'cloudCycles', 'cycle-1')));
    await assertFails(getDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1')));
    await assertFails(
      updateDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1'), { label: 'stolen' })
    );
    await assertFails(deleteDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1')));
  });

  test('allows only owner-scoped list queries', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'cloudCycles', 'alice-cycle'), cloudCycle({ id: 'alice-cycle' }));
      await setDoc(
        doc(db, 'cloudCycles', 'bob-cycle'),
        cloudCycle({ id: 'bob-cycle', userId: BOB })
      );
    });

    const ownedQuery = query(
      collection(dbFor(ALICE), 'cloudCycles'),
      where('userId', '==', ALICE)
    );
    await assertSucceeds(getDocs(ownedQuery));
    await assertFails(getDocs(collection(dbFor(ALICE), 'cloudCycles')));
    await assertFails(
      getDocs(
        query(collection(dbFor(ALICE), 'cloudCycles'), where('userId', '==', BOB))
      )
    );
  });

  test('rejects ownership transfer, unknown fields, and oversized updates', async () => {
    await seed(async (db) => {
      await setEntitlement(db, ALICE, true);
      await setDoc(doc(db, 'cloudCycles', 'cycle-1'), cloudCycle());
    });
    const ref = doc(dbFor(ALICE), 'cloudCycles', 'cycle-1');

    await assertFails(updateDoc(ref, { userId: BOB }));
    await assertFails(updateDoc(ref, { internalRole: 'admin' }));
    await assertFails(updateDoc(ref, { payloadJson: 'x'.repeat(750001) }));
  });

  test('rejects malformed and oversized documents for active owners', async () => {
    await seed((db) => setEntitlement(db, ALICE, true));

    await assertFails(
      setDoc(doc(dbFor(ALICE), 'cloudCycles', 'malformed'), cloudCycle({ id: 'wrong-id' }))
    );
    await assertFails(
      setDoc(
        doc(dbFor(ALICE), 'cloudCycles', 'cycle-1'),
        cloudCycle({ label: 'x'.repeat(201) })
      )
    );
    await assertFails(
      setDoc(
        doc(dbFor(ALICE), 'cloudCycles', 'cycle-1'),
        cloudCycle({ payloadJson: 'x'.repeat(750001), payloadBytes: 750001 })
      )
    );
  });
});
