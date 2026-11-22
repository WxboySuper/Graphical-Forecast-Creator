/**
 * Severe workspace shell tests. Verifies the surface switcher, the layout choice
 * (including the URL override and the compact-viewport fallback), and that the
 * map stays mounted but hidden behind other surfaces.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SevereWorkspaceShell } from './SevereWorkspaceShell';
import { parseWorkspaceSurface } from './useWorkspaceSurface';
import type { WorkspaceSurface } from './useWorkspaceSurface';

const mockMatchMedia = (compact: boolean) => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: compact && query.includes('max-width'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
};

const renderShell = (surface: WorkspaceSurface, search = '', onSurfaceChange = jest.fn()) => render(
  <MemoryRouter initialEntries={[`/forecast/severe${search}`]}>
    <SevereWorkspaceShell
      surface={surface}
      onSurfaceChange={onSurfaceChange}
      mapRef={{ current: null }}
      map={<div data-testid="map-content">map</div>}
      discussion={<div data-testid="discussion-content">discussion</div>}
      review={<div data-testid="review-content">review</div>}
    />
  </MemoryRouter>,
);

describe('SevereWorkspaceShell', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
  });

  test('parses unknown surface values as the map', () => {
    expect(parseWorkspaceSurface(null)).toBe('map');
    expect(parseWorkspaceSurface('bogus')).toBe('map');
    expect(parseWorkspaceSurface('discussion')).toBe('discussion');
    expect(parseWorkspaceSurface('review')).toBe('review');
  });

  test('marks the active surface and reports a surface change', () => {
    const onSurfaceChange = jest.fn();
    renderShell('map', '', onSurfaceChange);

    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Discussion' }));
    expect(onSurfaceChange).toHaveBeenCalledWith('discussion');
  });

  test('moves between surfaces with the arrow keys', () => {
    const onSurfaceChange = jest.fn();
    renderShell('map', '', onSurfaceChange);

    const mapTab = screen.getByRole('tab', { name: 'Map' });
    mapTab.focus();
    fireEvent.keyDown(mapTab, { key: 'ArrowRight' });
    expect(onSurfaceChange).toHaveBeenCalledWith('discussion');
  });

  test('shows Discussion full width by default and keeps the map mounted but hidden', () => {
    renderShell('discussion');

    expect(screen.getByTestId('discussion-content')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Forecast discussion' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Forecast discussion' })).not.toBeInTheDocument();
    expect(screen.getByTestId('severe-workspace-map')).toHaveAttribute('aria-hidden', 'true');
  });

  test('opens Discussion beside a visible map in the side-panel layout', () => {
    renderShell('discussion');
    fireEvent.click(screen.getByRole('button', { name: 'Side panel' }));

    expect(screen.getByRole('complementary', { name: 'Forecast discussion' })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize discussion panel' })).toBeInTheDocument();
    expect(screen.getByTestId('severe-workspace-map')).toHaveAttribute('aria-hidden', 'false');
    expect(localStorage.getItem('gfc-severe-discussion-layout')).toBe('panel');
  });

  test('lets the URL override the layout and locks the choice', () => {
    renderShell('discussion', '?discussionLayout=panel');

    expect(screen.getByRole('complementary', { name: 'Forecast discussion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full width' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Side panel' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('uses full width and hides the layout choice on a compact viewport', () => {
    mockMatchMedia(true);
    renderShell('discussion', '?discussionLayout=panel');

    expect(screen.queryByRole('group', { name: 'Discussion layout' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Forecast discussion' })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Forecast discussion' })).toBeInTheDocument();
  });

  test('shows Review with the map hidden', () => {
    renderShell('review');

    expect(screen.getByTestId('review-content')).toBeInTheDocument();
    expect(screen.getByTestId('severe-workspace-map')).toHaveAttribute('aria-hidden', 'true');
  });
});
