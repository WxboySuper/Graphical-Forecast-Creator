import { fireEvent, render, screen } from '@testing-library/react';
import OutlookTrimPopover from './OutlookTrimPopover';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';

jest.mock('../ui/popover', () => {
  const React = require('react') as typeof import('react');
  const PopoverContext = React.createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);
  const Popover = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    return <PopoverContext.Provider value={{ open, setOpen }}>{children}</PopoverContext.Provider>;
  };
  const PopoverTrigger = ({ children }: { children: React.ReactElement }) => {
    const context = React.useContext(PopoverContext);
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => context?.setOpen(true),
    });
  };
  const PopoverContent = ({ children }: { children: React.ReactNode }) => {
    const context = React.useContext(PopoverContext);
    return context?.open ? <div>{children}</div> : null;
  };
  return { Popover, PopoverTrigger, PopoverContent };
});

const buildController = (
  overrides: Partial<ForecastWorkspaceController> = {},
): ForecastWorkspaceController =>
  ({
    outlookTrimStrategy: 'us-country-minus-great-lakes',
    outlookTrimAutoOnDraw: false,
    outlookTrimPreviewOnly: false,
    isTrimmingOutlooks: false,
    onOutlookTrimStrategyChange: jest.fn(),
    onToggleOutlookTrimAutoOnDraw: jest.fn(),
    onToggleOutlookTrimPreviewOnly: jest.fn(),
    onTrimCurrentDayOutlooks: jest.fn(),
    ...overrides,
  }) as ForecastWorkspaceController;

describe('OutlookTrimPopover', () => {
  test('renders compact trim trigger without expanding toolbar sections', () => {
    render(<OutlookTrimPopover controller={buildController()} />);
    expect(screen.getByRole('button', { name: /trim outlooks to land/i })).toBeInTheDocument();
    expect(screen.queryByText(/trim prototype/i)).not.toBeInTheDocument();
  });

  test('opens popover settings from the trim trigger', async () => {
    render(<OutlookTrimPopover controller={buildController()} />);

    const trigger = screen.getByRole('button', { name: /trim outlooks to land/i });
    fireEvent.click(trigger);

    expect(screen.getByText('Trim to land')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto-trim while drawing')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview trim only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trim current day/i })).toBeInTheDocument();
  });
});
