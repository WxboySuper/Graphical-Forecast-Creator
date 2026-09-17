import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import OutlookGeometryCopyControls from './OutlookGeometryCopyControls';

jest.mock('../ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../ui/dropdown-menu', () => {
  const React = require('react') as typeof import('react');
  const MenuContext = React.createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);
  const DropdownMenu = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    return <MenuContext.Provider value={{ open, setOpen }}>{children}</MenuContext.Provider>;
  };
  const DropdownMenuTrigger = ({ children }: { children: React.ReactElement }) => {
    const context = React.useContext(MenuContext);
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => context?.setOpen(true),
    });
  };
  const DropdownMenuContent = ({ children }: { children: React.ReactNode }) => {
    const context = React.useContext(MenuContext);
    return context?.open ? <div role="menu">{children}</div> : null;
  };
  const DropdownMenuItem = ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" role="menuitem" onClick={onSelect}>{children}</button>
  );
  const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const DropdownMenuSeparator = () => <hr />;
  return { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator };
});

describe('OutlookGeometryCopyControls', () => {
  it('renders a compact menu trigger when a source hazard has geometry', () => {
    render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind', 'hail']}
        canCopyAllFrom={(source) => source === 'wind'}
        canCopyProbabilityFrom={(source) => source === 'wind'}
        onCopyAllFrom={jest.fn()}
        onCopyProbabilityFrom={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Match geometry from another hazard')).toBeInTheDocument();
    expect(screen.queryByText('All levels')).not.toBeInTheDocument();
  });

  it('does not render when no source hazards have copyable geometry', () => {
    const { container } = render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind', 'hail']}
        canCopyAllFrom={() => false}
        canCopyProbabilityFrom={() => false}
        onCopyAllFrom={jest.fn()}
        onCopyProbabilityFrom={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows source hazards in the dropdown menu', async () => {
    render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind', 'hail']}
        canCopyAllFrom={() => true}
        canCopyProbabilityFrom={() => true}
        onCopyAllFrom={jest.fn()}
        onCopyProbabilityFrom={jest.fn()}
      />,
    );

    const trigger = screen.getByLabelText('Match geometry from another hazard');
    fireEvent.click(trigger);

    expect(screen.getByText('Match to Tornado')).toBeInTheDocument();
    expect(screen.getByText('From Wind')).toBeInTheDocument();
    expect(screen.getByText('From Hail')).toBeInTheDocument();
  });

  it('invokes the selected copy mode without requiring a nested submenu', async () => {
    const onCopyAllFrom = jest.fn();
    const onCopyProbabilityFrom = jest.fn();

    render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind']}
        canCopyAllFrom={() => true}
        canCopyProbabilityFrom={() => true}
        onCopyAllFrom={onCopyAllFrom}
        onCopyProbabilityFrom={onCopyProbabilityFrom}
      />,
    );

    const trigger = screen.getByLabelText('Match geometry from another hazard');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'All levels' }));
    expect(onCopyAllFrom).toHaveBeenCalledWith('wind');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '15% only' }));
    expect(onCopyProbabilityFrom).toHaveBeenCalledWith('wind');
  });
});
