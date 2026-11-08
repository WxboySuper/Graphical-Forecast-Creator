/**
 * Forecast menu tests. Verifies the workspace showcase marks the current
 * workspace, previews unreleased workspaces as non-interactive rows, and keeps
 * secondary destinations reachable without exposing unreleased routes.
 */
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Map as MapIcon, MessageSquare } from 'lucide-react';
import { ForecastNavigationMenu } from './ForecastMenu';
import type { AppNavigationItemId, AppNavigationItemWithId } from '../../config/featureNavigation';
import {
  FORECAST_WORKSPACES,
  getExposedForecastWorkspaces,
} from '../../config/forecastWorkspaces';

jest.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    asChild,
    disabled,
    ...rest
  }: {
    children: ReactNode;
    asChild?: boolean;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (asChild
    ? <div>{children}</div>
    : <div role="menuitem" aria-disabled={disabled ? 'true' : undefined} aria-label={rest['aria-label'] as string}>{children}</div>),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const forecastItem = { id: 'forecast', to: '/forecast', label: 'Forecast', shortcutLabel: '⌃1' } as AppNavigationItemWithId;
const discussionItem = { id: 'discussion', to: '/discussion', label: 'Discussion' } as AppNavigationItemWithId;
const icons = { forecast: MapIcon, discussion: MessageSquare } as unknown as Record<AppNavigationItemId, typeof MapIcon>;

const renderMenu = (pathname: string) => render(
  <MemoryRouter initialEntries={[pathname]}>
    <ForecastNavigationMenu item={forecastItem} pathname={pathname} search="" otherItems={pathname === '/discussion' ? [] : [discussionItem]} icons={icons} />
  </MemoryRouter>,
);

describe('ForecastNavigationMenu', () => {
  test('marks only the current exposed workspace and links every exposed workspace', () => {
    renderMenu('/forecast/severe');

    expect(screen.getByRole('link', { name: 'Severe forecast workspace' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByText('Current')).toHaveLength(1);
    for (const workspace of getExposedForecastWorkspaces()) {
      expect(screen.getByRole('link', { name: `${workspace.label} forecast workspace` }))
        .toHaveAttribute('href', workspace.path);
    }
  });

  test('previews unreleased workspaces as disabled rows without links', () => {
    renderMenu('/forecast/severe');

    const futureWorkspaces = FORECAST_WORKSPACES.filter((workspace) => workspace.status === 'future');
    expect(futureWorkspaces.length).toBeGreaterThan(0);
    for (const workspace of futureWorkspaces) {
      const row = screen.getByRole('menuitem', { name: `${workspace.label}, coming soon` });
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(within(row).queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: `${workspace.label} forecast workspace` })).not.toBeInTheDocument();
    }
  });

  test('routes legacy Discussion through the Forecast workspace menu context', () => {
    renderMenu('/discussion');

    expect(screen.getByRole('button', { name: 'Forecast menu, current page Discussion' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Discussion' })).not.toBeInTheDocument();
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
  });
});
