import React from 'react';
import { render, screen } from '@testing-library/react';
import Documentation from './Documentation';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon" />,
}));

// Mock UI components
jest.mock('../ui/button', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

jest.mock('../ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs">{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button data-testid={`trigger-${value}`}>{children}</button>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`content-${value}`}>{children}</div>
  ),
}));

// Mock content components
jest.mock('./DocumentationContent', () => ({
  OverviewSection: () => <div data-testid="overview-section">Overview Content</div>,
  UsageSection: () => <div data-testid="usage-section">Usage Content</div>,
  OutlooksSection: () => <div data-testid="outlooks-section">Outlooks Content</div>,
  CategoricalSection: () => <div data-testid="categorical-section">Categorical Content</div>,
}));

describe('Documentation', () => {
  it('renders without crashing', () => {
    render(<Documentation />);
    expect(screen.getByText('Help & Documentation')).toBeInTheDocument();
  });

  it('renders all tab triggers', () => {
    render(<Documentation />);
    expect(screen.getByTestId('trigger-overview')).toBeInTheDocument();
    expect(screen.getByTestId('trigger-usage')).toBeInTheDocument();
    expect(screen.getByTestId('trigger-outlooks')).toBeInTheDocument();
    expect(screen.getByTestId('trigger-conversion')).toBeInTheDocument();
  });

  it('renders tabs container', () => {
    render(<Documentation />);
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });

  it('renders close button when onClose is provided', () => {
    const onClose = jest.fn();
    render(<Documentation onClose={onClose} />);
    const closeButton = screen.getByLabelText('Close documentation panel');
    expect(closeButton).toBeInTheDocument();
  });

  it('does not render close button when onClose is not provided', () => {
    render(<Documentation />);
    expect(screen.queryByLabelText('Close documentation panel')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<Documentation onClose={onClose} />);
    const closeButton = screen.getByLabelText('Close documentation panel');
    closeButton.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders OverviewSection by default', () => {
    render(<Documentation />);
    expect(screen.getByTestId('overview-section')).toBeInTheDocument();
  });
});