/**
 * Feature boundary tests. Verify gated UI renders only when the requested feature is exposed.
 */
import { render, screen } from '@testing-library/react';
import { flagCapability, type FlagName } from '../config/flags';
import { FeatureBoundary, useFeatureEffect } from './FeatureBoundary';
import { runWithBuildTarget, withFlag } from '../testing/flags';

/** Returns a probe component and spy for gated side effects. */
const createSideEffectProbe = (feature: FlagName) => {
  const spy = jest.fn();
  const Probe = () => {
    useFeatureEffect(feature, () => {
      spy();
      return undefined;
    }, []);
    return <div>Effect probe</div>;
  };
  return { spy, Probe };
};

describe('FeatureBoundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders children only when the feature is exposed', () => {
    withFlag('autoTstm', false);

    const { rerender } = render(
      <FeatureBoundary feature="autoTstm">
        <div>Auto-TSTM controls</div>
      </FeatureBoundary>
    );

    expect(screen.queryByText('Auto-TSTM controls')).not.toBeInTheDocument();

    jest.restoreAllMocks();
    runWithBuildTarget('beta', () => {
      withFlag('autoTstm', true, 'beta');

      rerender(
        <FeatureBoundary feature="autoTstm">
          <div>Auto-TSTM controls</div>
        </FeatureBoundary>
      );

      expect(screen.getByText('Auto-TSTM controls')).toBeInTheDocument();
    });
  });

  test('does not run gated effects while the feature remains disabled', () => {
    withFlag('autoTstm', false);
    const { spy, Probe } = createSideEffectProbe('autoTstm');

    render(
      <FeatureBoundary feature="autoTstm">
        <Probe />
      </FeatureBoundary>
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test('runs gated effects when the feature is exposed', () => {
    runWithBuildTarget('beta', () => {
      withFlag('autoTstm', true, 'beta');
      const { spy, Probe } = createSideEffectProbe('autoTstm');

      render(<Probe />);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(flagCapability('autoTstm')).toBe('TSTM_GENERATION_ENABLED');
    });
  });
});