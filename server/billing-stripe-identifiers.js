'use strict';

/** Returns the Stripe object ID for either an expanded object or a plain ID. */
const getStripeObjectId = (value) => (typeof value === 'string' ? value : value?.id || '');

/** Returns the first usable Stripe ID from a list of expanded objects or plain IDs. */
const getFirstStripeObjectId = (values) => values.map(getStripeObjectId).find(Boolean) || '';

module.exports = {
  getFirstStripeObjectId,
  getStripeObjectId,
};
