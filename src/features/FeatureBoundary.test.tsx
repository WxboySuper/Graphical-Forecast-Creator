import { render, screen } from '@testing-library/react';
import { FEATURE_EXPOSURE_REGISTRY } from '../config/featureExposure';
import { FeatureBoundary, useFeatureEffect } from './FeatureBoundary';

const effectSpy = jest.fn();

const EffectProbe = () => {
  useFeatureEffect('autoTstm', () => {
    effectSpy();
    return undefined;
  }, []);

  return <div>Effect probe</div>;
};

describe('FeatureBoundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    effectSpy.mockReset();
  });

  test('renders children only when the feature is exposed', () => {
    jest.spyOn(
      require('../config/featureExposure'),
      'isFeatureExposed'
    ).mockReturnValue(false);

    const { rerender } = render(
      <FeatureBoundary feature="autoTstm">
        <div>Auto-TSTM controls</div>
      </FeatureBoundary>
    );

    expect(screen.queryByText('Auto-TSTM controls')).not.toBeInTheDocument();

    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);
    rerender(
      <FeatureBoundary feature="autoTstm">
        <div>Auto-TSTM controls</div>
      </FeatureBoundary>
    );

    expect(screen.getByText('Auto-TSTM controls')).toBeInTheDocument();
  });

  test('does not run gated effects while the feature remains disabled', () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(false);

    render(
      <FeatureBoundary feature="autoTstm">
        <EffectProbe />
      </FeatureBoundary>
    );

    expect(effectSpy).not.toHaveBeenCalled();
  });

  test('runs gated effects when the feature is exposed', () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);

    render(<EffectProbe />);

    expect(effectSpy).toHaveBeenCalledTimes(1);
    expect(FEATURE_EXPOSURE_REGISTRY.autoTstm.serverCapabilityKey).toBe('TSTM_GENERATION_ENABLED');
  });
});
