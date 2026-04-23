import React from 'react';
import { render, screen } from '@testing-library/react';
import { OutlookSelectorPanel } from './OutlookSelectorPanel';

// Mock the hook that provides the logic
jest.mock('../OutlookPanel/useOutlookPanelLogic', () => ({
  __esModule: true,
  default: () => ({
    activeOutlookType: 'tornado',
    activeProbability: '10%',
    isSignificant: false,
    significantThreatsEnabled: true,
    getOutlookTypeEnabled: jest.fn((type: string) => ['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'].includes(type)),
    outlookTypeHandlers: {
      tornado: jest.fn(),
      wind: jest.fn(),
      hail: jest.fn(),
      categorical: jest.fn(),
      totalSevere: jest.fn(),
      'day4-8': jest.fn(),
    },
    probabilities: ['2%', '5%', '10%', '15%', '30%', '45%'],
    probabilityHandlers: {
      '2%': jest.fn(),
      '5%': jest.fn(),
      '10%': jest.fn(),
      '15%': jest.fn(),
      '30%': jest.fn(),
      '45%': jest.fn(),
    },
  }),
}));

// Mock outlookUtils
jest.mock('../../utils/outlookUtils', () => ({
  getCategoricalRiskDisplayName: jest.fn((level: string) => level),
  getOutlookColor: jest.fn(() => '#ff0000'),
}));

// Mock lucide icons
jest.mock('lucide-react', () => ({
  Tornado: () => <span data-testid="tornado-icon" />,
  Wind: () => <span data-testid="wind-icon" />,
  CloudHail: () => <span data-testid="hail-icon" />,
  LayoutGrid: () => <span data-testid="grid-icon" />,
  CloudSun: () => <span data-testid="sun-icon" />,
  Calendar: () => <span data-testid="calendar-icon" />,
}));

// Mock UI components
jest.mock('../ui/button', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

jest.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-content">{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-provider">{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-trigger">{children}</div>,
}));

describe('OutlookSelectorPanel', () => {
  it('renders without crashing', () => {
    render(<OutlookSelectorPanel />);
    expect(screen.getByTestId('tooltip-provider')).toBeInTheDocument();
  });

  it('renders outlook type buttons', () => {
    render(<OutlookSelectorPanel />);
    // The component should have buttons for outlook types
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders probability buttons', () => {
    render(<OutlookSelectorPanel />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('displays current selection preview', () => {
    render(<OutlookSelectorPanel />);
    // The component should show the current outlook type and probability
    // Use getAllByText since Tornado appears in both button label and tooltip
    const tornadoElements = screen.getAllByText(/Tornado/);
    expect(tornadoElements.length).toBeGreaterThan(0);
  });
});