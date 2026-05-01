import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrandSection, MainTabs, RightActions } from './NavbarSections';

const mockUseAuth = jest.fn();

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe('NavbarSections', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ hostedAuthEnabled: true, status: 'signed_in', user: { email: 'user@example.com' } });
    window.open = jest.fn();
  });

  test('renders brand and active main tabs', () => {
    render(
      <MemoryRouter initialEntries={['/forecast/day1']}>
        <BrandSection />
        <MainTabs />
      </MemoryRouter>
    );

    expect(screen.getByText('Graphical Forecast Creator')).toBeInTheDocument();
    expect(screen.getByText('GFC')).toBeInTheDocument();
    expect(screen.getAllByText('Forecast')[0].closest('a')).toHaveClass('is-active');
  });

  test('wires account state, theme toggle, legal/docs actions, and external links', () => {
    const onToggleDarkMode = jest.fn();
    const onToggleDocumentation = jest.fn();
    const onViewTerms = jest.fn();
    const onViewPrivacyPolicy = jest.fn();

    render(
      <MemoryRouter>
        <RightActions
          darkMode={false}
          onToggleDarkMode={onToggleDarkMode}
          onToggleDocumentation={onToggleDocumentation}
          onViewTerms={onViewTerms}
          onViewPrivacyPolicy={onViewPrivacyPolicy}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/Account \(user@example.com\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Switch to dark mode/i));
    expect(onToggleDarkMode).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Documentation'));
    expect(onToggleDocumentation).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Terms of Service'));
    expect(onViewTerms).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Privacy Policy'));
    expect(onViewPrivacyPolicy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('GitHub Repository'));
    expect(window.open).toHaveBeenCalledWith(
      'https://github.com/WxboySuper/Graphical-Forecast-Creator',
      '_blank',
      'noopener,noreferrer'
    );
  });

  test('renders signed-out and dark-mode labels', () => {
    mockUseAuth.mockReturnValue({ hostedAuthEnabled: false, status: 'signed_out', user: null });

    render(
      <MemoryRouter>
        <RightActions darkMode onToggleDarkMode={jest.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    expect(screen.getByLabelText(/Switch to light mode/i)).toBeInTheDocument();
  });
});
