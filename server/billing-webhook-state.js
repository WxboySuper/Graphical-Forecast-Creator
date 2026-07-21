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

/** Applies one verified Stripe event exactly once without allowing older state to win. */
const applyEntitlementWebhookEvent = async ({ db, entitlementRef, event, buildNextPayload }) => {
  if (!db || !entitlementRef || !event?.id || !event?.type || typeof buildNextPayload !== 'function') {
    throw new Error('A verified Stripe event and entitlement target are required.');
  }

  const eventRef = db.collection(EVENT_LEDGER_COLLECTION).doc(event.id);
  return db.runTransaction(async (transaction) => {
    const [eventSnapshot, entitlementSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(entitlementRef),
    ]);

    if (eventSnapshot.exists) {
      return { applied: false, reason: 'duplicate' };
    }

    const existingData = entitlementSnapshot.exists ? entitlementSnapshot.data() || {} : {};
    const stale = isStaleStripeEvent(existingData, event);
    const processedAt = new Date();
    transaction.set(eventRef, {
      eventType: event.type,
      eventCreated: Number(event.created) || 0,
      entitlementId: entitlementRef.id,
      outcome: stale ? 'stale' : 'applied',
      processedAt,
      expiresAt: new Date(processedAt.getTime() + EVENT_LEDGER_RETENTION_MS),
    });

    if (stale) {
      return { applied: false, reason: 'stale' };
    }

    const nextPayload = {
      ...buildNextPayload(existingData),
      lastStripeEventId: event.id,
      lastStripeEventType: event.type,
      lastStripeEventCreated: Number(event.created) || 0,
    };
    transaction.set(entitlementRef, nextPayload, { merge: true });
    return { applied: true, reason: 'applied', nextPayload };
  });
};

module.exports = {
  applyEntitlementWebhookEvent,
  isStaleStripeEvent,
};
