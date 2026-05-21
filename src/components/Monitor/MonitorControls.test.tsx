import { fireEvent, render, screen } from '@testing-library/react';
import MonitorControls from './MonitorControls';
import { DEFAULT_MONITOR_SETTINGS } from '../../monitor/types';

const baseProps = {
  settings: DEFAULT_MONITOR_SETTINGS,
  outlookOptions: [{
    id: 'current',
    kind: 'current' as const,
    label: 'Current Day 1 outlook',
    cycleDate: '2026-04-28',
  }],
  selectedOutlook: {
    id: 'current',
    kind: 'current' as const,
    label: 'Current Day 1 outlook',
    cycleDate: '2026-04-28',
  },
  statusMessage: 'Live layers are opt-in.',
  syncLabel: 'Local settings',
  onRadarModeChange: jest.fn(),
  onRadarProductChange: jest.fn(),
  onRadarSiteChange: jest.fn(),
  onRadarOpacityChange: jest.fn(),
  onSatelliteProductChange: jest.fn(),
  onSatelliteOpacityChange: jest.fn(),
  onOutlookSourceChange: jest.fn(),
  onAnimationEnabledChange: jest.fn(),
  onAnimationSpeedChange: jest.fn(),
  onRefresh: jest.fn(),
};

describe('MonitorControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders controls and dispatches user changes', () => {
    render(<MonitorControls {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Monitor' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Radar site'), { target: { value: 'KDVN' } });
    expect(baseProps.onRadarSiteChange).toHaveBeenCalledWith('KDVN');

    fireEvent.change(screen.getAllByDisplayValue('Off')[0], { target: { value: 'mrms-conus' } });
    expect(baseProps.onRadarModeChange).toHaveBeenCalledWith('mrms-conus');

    fireEvent.click(screen.getByLabelText('Refresh live layers'));
    expect(baseProps.onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    expect(baseProps.onAnimationEnabledChange).toHaveBeenCalledWith(true);
  });
});
