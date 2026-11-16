import { render, screen } from '@testing-library/react';
import MonitorAlertsSection from './MonitorAlertsSection';
import { DEFAULT_MONITOR_SETTINGS } from '../types';

const baseProps = {
  settings: { ...DEFAULT_MONITOR_SETTINGS, alertsEnabled: true },
  alertsMeta: {
    alertCollection: { type: 'FeatureCollection' as const, features: [] },
    frameCount: 2,
    frameIndex: 1,
    loading: false,
    error: null as string | null,
    fetchedAt: '2026-11-07T16:30:00.000Z' as string | null,
    polygonCount: 0,
  },
  onAlertsEnabledChange: jest.fn(),
  onAlertsOpacityChange: jest.fn(),
  onAlertsShowWatchesChange: jest.fn(),
  onAlertsShowWarningsChange: jest.fn(),
  onAlertsShowAdvisoriesChange: jest.fn(),
};

describe('MonitorAlertsSection', () => {
  test('shows loading state and last successful fetch while refreshing', () => {
    render(
      <MonitorAlertsSection
        {...baseProps}
        alertsMeta={{ ...baseProps.alertsMeta, loading: true }}
      />,
    );

    expect(screen.getByText('Loading NWS alerts…')).toBeInTheDocument();
    expect(screen.queryByText(/Last successful fetch/)).not.toBeInTheDocument();
  });

  test('identifies retained polygons and gives a retry action after failure', () => {
    render(
      <MonitorAlertsSection
        {...baseProps}
        alertsMeta={{
          ...baseProps.alertsMeta,
          error: 'NWS alert refresh failed; showing last available data.',
        }}
      />,
    );

    expect(screen.getByText(/NWS alert refresh failed; showing last available data\. Refresh live layers to retry\./)).toBeInTheDocument();
    expect(screen.getByText(/Retained alert history was last updated/)).toBeInTheDocument();
    expect(screen.queryByText(/frame 2\/2/)).not.toBeInTheDocument();
  });

  test('clears the failure warning after recovery', () => {
    const { rerender } = render(
      <MonitorAlertsSection
        {...baseProps}
        alertsMeta={{ ...baseProps.alertsMeta, error: 'Refresh failed.' }}
      />,
    );

    rerender(<MonitorAlertsSection {...baseProps} />);

    expect(screen.queryByText(/Refresh failed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Last successful fetch:/)).toBeInTheDocument();
    expect(screen.getByText(/frame 2\/2/)).toBeInTheDocument();
  });

  test.each([null, 'not-a-timestamp'])('handles missing or invalid fetch time (%s)', (fetchedAt) => {
    render(
      <MonitorAlertsSection
        {...baseProps}
        alertsMeta={{ ...baseProps.alertsMeta, error: 'Refresh failed.', fetchedAt }}
      />,
    );

    expect(screen.getByText(/Retained alert history was last updated Latest time unavailable\./)).toBeInTheDocument();
  });

  test('shows only the retry message when no alerts were ever retained', () => {
    render(
      <MonitorAlertsSection
        {...baseProps}
        alertsMeta={{ ...baseProps.alertsMeta, error: 'Refresh failed.', fetchedAt: null, frameCount: 0, frameIndex: 0 }}
      />,
    );

    expect(screen.getByText(/Refresh failed\. Refresh live layers to retry\./)).toBeInTheDocument();
    expect(screen.queryByText(/Retained alert history/)).not.toBeInTheDocument();
  });

  test('includes the calendar date in the fetch time', () => {
    render(<MonitorAlertsSection {...baseProps} />);

    expect(screen.getByText(/Last successful fetch: .*Nov/)).toBeInTheDocument();
  });
});
