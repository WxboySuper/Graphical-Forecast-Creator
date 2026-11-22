/**
 * Navbar-section tests. Verifies the brand, main-tab, and right-action sections
 * render their route and authentication states correctly.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BrandSection, MainTabs, RightActions } from './NavbarSections';
import { getExposedForecastWorkspaces } from '../../config/forecastWorkspaces';
import { getVisibleNavigationItems } from '../../config/featureNavigation';

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
  DropdownMenuItem: ({
    children,
    onSelect,
    asChild,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    asChild?: boolean;
  }) => (asChild ? <div>{children}</div> : <button type="button" onClick={onSelect}>{children}</button>),
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
      <MemoryRouter initialEntries={['/forecast/severe/day1']}>
        <BrandSection />
        <MainTabs />
      </MemoryRouter>
    );

    expect(screen.getByText('Graphical Forecast Creator')).toBeInTheDocument();
    expect(screen.getByText('GFC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Forecast menu, current page Severe/i }))
      .toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Monitor' })).toHaveAttribute('href', '/monitor');
    expect(screen.queryByRole('link', { name: 'Tropical forecast workspace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Winter' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Forecast menu, current page Severe/i }))
      .toBeInTheDocument();

    const workspaceLinks = getExposedForecastWorkspaces().map((workspace) =>
      screen.getByRole('link', { name: `${workspace.label} forecast workspace` })
    );
    expect(workspaceLinks.map((link) => link.getAttribute('href'))).toEqual(
      getExposedForecastWorkspaces().map((workspace) => workspace.path)
    );
    expect(screen.getByRole('link', { name: 'Severe forecast workspace' })).toHaveAttribute('aria-current', 'page');
    const otherItems = getVisibleNavigationItems().filter(
      ({ id }) => !['home', 'forecast', 'discussion', 'verification', 'monitor'].includes(id)
    );
    for (const item of otherItems) {
      const label = item.id === 'tropical-workspace' ? 'Tropical tools' : item.label;
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', item.to);
    }
    for (const workspace of getExposedForecastWorkspaces()) {
      const workspaceLink = screen.getByRole('link', {
        name: `${workspace.label} forecast workspace`,
      });
      expect(screen.getByText(workspace.description)).toBeInTheDocument();
      expect(workspaceLink.getAttribute('aria-describedby')).toContain(
        `forecast-workspace-${workspace.id}-description`
      );
      expect(workspaceLink.getAttribute('aria-describedby')).toContain(
        `forecast-workspace-${workspace.id}-focus`
      );
      for (const focusPoint of workspace.focus) {
        expect(screen.getByText(focusPoint)).toBeInTheDocument();
      }
    }
  });

  test('marks the Discussion compatibility route as the current Forecast menu context', () => {
    render(
      <MemoryRouter initialEntries={['/discussion/thread/42']}>
        <MainTabs />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Forecast menu, current page Discussion' }))
      .toHaveClass('is-active');
    expect(screen.queryByRole('link', { name: 'Discussion' })).not.toBeInTheDocument();
  });

  test('wires account state, theme toggle, legal/docs actions, and external links', () => {
    const onToggleDarkMode = jest.fn();
    const onToggleDocumentation = jest.fn();
    const onViewTerms = jest.fn();
    const onViewPrivacyPolicy = jest.fn();

    render(
      <MemoryRouter initialEntries={['/forecast']}>
        <Routes>
          <Route
            path="/forecast"
            element={
              <RightActions
                darkMode={false}
                onToggleDarkMode={onToggleDarkMode}
                onToggleDocumentation={onToggleDocumentation}
                onViewTerms={onViewTerms}
                onViewPrivacyPolicy={onViewPrivacyPolicy}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
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
    const contactLink = screen.getByRole('link', { name: /Contact us/i });
    expect(contactLink).toHaveAttribute('href', 'mailto:contact@gfcweather.com');
    expect(contactLink).toHaveTextContent('contact@gfcweather.com');
    expect(screen.getByRole('link', { name: /What's New/i })).toHaveAttribute('href', 'https://gfcweather.com/updates/');
    expect(screen.getByRole('link', { name: /Pricing/i })).toHaveAttribute('href', 'https://gfcweather.com/pricing/');
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
