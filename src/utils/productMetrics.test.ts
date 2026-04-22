jest.mock('../lib/firebase', () => ({ isHostedAuthEnabled: false }));
import { queueProductMetric } from './productMetrics';

describe('productMetrics', () => {
  test('queueProductMetric no-ops when hosted auth disabled', () => {
    expect(() => queueProductMetric({ event: 'account_signin' })).not.toThrow();
  });
});
