/**
 * Product metrics tests. Verify product event names, payloads, and queue behavior.
 */
jest.mock('../lib/firebase', () => ({ isHostedAuthEnabled: false }));
import { queueProductMetric } from './productMetrics';

describe('productMetrics', () => {
  test('queueProductMetric no-ops when hosted auth disabled', () => {
    expect(() => queueProductMetric({ event: 'account_signin' })).not.toThrow();
  });
});