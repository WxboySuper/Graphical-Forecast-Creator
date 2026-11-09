import { render, screen } from '@testing-library/react';
import { FeatureBoundary } from './FeatureBoundary';
import { BUILD_TARGETS, runWithBuildTarget } from '../testing/featureExposure/harness';
import { MonitorMesoscaleIntegration } from '../monitor/components/MonitorMesoscaleIntegration';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';

describe('Monitor mesoscale exposure', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(BUILD_TARGETS.filter((target) => target !== 'local'))('does not mount Monitor data hooks on %s', async (target) => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const intervalSpy = jest.spyOn(window, 'setInterval');
    await runWithBuildTarget(target, async () => {
      render(
        <FeatureBoundary feature="mesoscaleWorkspace">
          <MonitorMesoscaleIntegration settings={DEFAULT_MONITOR_SETTINGS.mesoscale} onSettingsChange={jest.fn()}>
            {() => <p>Mesoscale controls</p>}
          </MonitorMesoscaleIntegration>
        </FeatureBoundary>,
      );
      expect(screen.queryByText('Mesoscale controls')).not.toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(intervalSpy).not.toHaveBeenCalled();
  });
});
