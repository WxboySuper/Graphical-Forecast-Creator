import * as Sentry from '@sentry/react';
import { appendSentryReduxEnhancer } from './sentryEnhancer';

jest.mock('@sentry/react', () => ({
  createReduxEnhancer: jest.fn(() => 'sentry-enhancer'),
}));

jest.mock('../instrument', () => ({
  isSentryEnabled: jest.fn(),
}));

const { isSentryEnabled } = jest.requireMock('../instrument') as {
  isSentryEnabled: jest.Mock;
};

describe('appendSentryReduxEnhancer', () => {
  const getDefaultEnhancers = jest.fn(() => ['default-enhancer'] as const);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only default enhancers when Sentry is disabled', () => {
    isSentryEnabled.mockReturnValue(false);
    expect(appendSentryReduxEnhancer(getDefaultEnhancers)).toEqual(['default-enhancer']);
    expect(Sentry.createReduxEnhancer).not.toHaveBeenCalled();
  });

  it('appends the Sentry enhancer when Sentry is enabled', () => {
    isSentryEnabled.mockReturnValue(true);
    expect(appendSentryReduxEnhancer(getDefaultEnhancers)).toEqual([
      'default-enhancer',
      'sentry-enhancer',
    ]);
    expect(Sentry.createReduxEnhancer).toHaveBeenCalledWith(
      expect.objectContaining({
        attachReduxState: false,
      })
    );
  });
});
