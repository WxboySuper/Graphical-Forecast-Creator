'use strict';

const EVENT_LEDGER_COLLECTION = 'processedStripeWebhookEvents';
const EVENT_LEDGER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Returns true when the incoming event would move entitlement state backward. */
const isStaleStripeEvent = (existingData, event) => {
  const lastCreated = Number(existingData.lastStripeEventCreated) || 0;
  const eventCreated = Number(event.created) || 0;
  if (eventCreated < lastCreated) {
    return true;
  }

  return (
    eventCreated === lastCreated &&
    existingData.lastStripeEventType === 'customer.subscription.deleted' &&
    event.type !== 'customer.subscription.deleted'
  );
};

/** True when the transaction has every verified input needed to write billing state. */
const hasWebhookStateInput = ({ db, entitlementRef, event, buildNextPayload }) =>
  [db, entitlementRef, event?.id, event?.type, typeof buildNextPayload === 'function'].every(Boolean);

/** Reads the ledger and entitlement snapshots before any transaction writes occur. */
const readWebhookState = async (transaction, eventRef, entitlementRef) => {
  const [eventSnapshot, entitlementSnapshot] = await Promise.all([
    transaction.get(eventRef),
    transaction.get(entitlementRef),
  ]);
  return { eventSnapshot, entitlementSnapshot };
};

/** Returns the previously committed outcome for a repeated Stripe event id. */
const createDuplicateResult = (eventSnapshot) => ({
  applied: false,
  reason: 'duplicate',
  priorOutcome: eventSnapshot.data()?.outcome || 'unknown',
});

/** Builds the TTL-ready ledger record for one entitlement processing attempt. */
const createEventLedgerPayload = ({ event, entitlementRef, stale }) => {
  const processedAt = new Date();
  return {
    eventType: event.type,
    eventCreated: Number(event.created) || 0,
    entitlementId: entitlementRef.id,
    outcome: stale ? 'stale' : 'applied',
    processedAt,
    expiresAt: new Date(processedAt.getTime() + EVENT_LEDGER_RETENTION_MS),
  };
};

/** Builds the accepted entitlement payload with its Stripe ordering marker. */
const createAcceptedEntitlementPayload = ({ existingData, event, buildNextPayload }) => ({
  ...buildNextPayload(existingData),
  lastStripeEventId: event.id,
  lastStripeEventType: event.type,
  lastStripeEventCreated: Number(event.created) || 0,
});

/** Performs one atomic ledger and entitlement update. */
const applyEntitlementTransaction = async ({ transaction, eventRef, entitlementRef, event, buildNextPayload }) => {
  const { eventSnapshot, entitlementSnapshot } = await readWebhookState(
    transaction,
    eventRef,
    entitlementRef
  );
  if (eventSnapshot.exists) {
    return createDuplicateResult(eventSnapshot);
  }

  const existingData = entitlementSnapshot.exists ? entitlementSnapshot.data() || {} : {};
  const stale = isStaleStripeEvent(existingData, event);
  transaction.set(eventRef, createEventLedgerPayload({ event, entitlementRef, stale }));
  if (stale) {
    return { applied: false, reason: 'stale' };
  }

  const nextPayload = createAcceptedEntitlementPayload({ existingData, event, buildNextPayload });
  transaction.set(entitlementRef, nextPayload, { merge: true });
  return { applied: true, reason: 'applied', nextPayload };
};

/** Applies one verified Stripe event exactly once without allowing older state to win. */
const applyEntitlementWebhookEvent = async ({ db, entitlementRef, event, buildNextPayload }) => {
  if (!hasWebhookStateInput({ db, entitlementRef, event, buildNextPayload })) {
    throw new Error('A verified Stripe event and entitlement target are required.');
  }

  const eventRef = db.collection(EVENT_LEDGER_COLLECTION).doc(event.id);
  return db.runTransaction((transaction) =>
    applyEntitlementTransaction({ transaction, eventRef, entitlementRef, event, buildNextPayload })
  );
};

module.exports = {
  applyEntitlementWebhookEvent,
  isStaleStripeEvent,
};
