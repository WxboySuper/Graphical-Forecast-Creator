/**
 * Application-shell tests. Verify route composition, mocked page rendering, and
 * top-level application state around the main App component.
 */
import { render, screen, act } from '@testing-library/react';
import App, { ForecastLegacyRedirect } from './App';
import { MemoryRouter, Outlet as MockOutlet, Route, Routes, useLocation } from 'react-router';

// Mock lightweight routes directly so the application test does not execute page logic.
jest.mock('./pages/HomePage', () => ({
  __esModule: true,
  default: () => <div>HomePage Mock</div>,
}));
jest.mock('./pages/AccountPage', () => ({
  __esModule: true,
  default: () => <div>AccountPage Mock</div>,
}));
jest.mock('./pages/HomePage', () => ({
  __esModule: true,
  default: () => <div>HomePage Mock</div>,
}));

// Mock components
jest.mock('./components/Layout', () => ({
  AppLayout: () => (
    <div>
      <div>AppLayout Mock</div>
      <MockOutlet />
    </div>
  ),
}));

jest.mock('./components/Map/ForecastMap', () => () => <div>ForecastMap Mock</div>);
jest.mock('./components/Documentation/Documentation', () => () => <div>Documentation Mock</div>);
jest.mock('./components/ToS/ToSModal', () => ({
  __esModule: true,
  hasAcceptedToS: () => true,
  default: () => <div>ToSModal Mock</div>,
}));
jest.mock('./components/PrivacyPolicy/PrivacyPolicyModal', () => ({
  __esModule: true,
  hasAcceptedPrivacyPolicy: () => true,
  default: () => <div>PrivacyPolicyModal Mock</div>,
}));

describe('App Simple', () => {
  test('renders HomePage by default', () => {
    // eslint-disable-next-line testing-library/no-unnecessary-act -- explicit act keeps the render async-safe if App gains effect-driven updates
    act(() => {
      render(<App />);
    });
    expect(screen.getByText(/HomePage Mock/i)).toBeInTheDocument();
  });

  test.each(['/beta', '/beta-access/private-path?t=old-invite-token'])(
    'sends retired closed-beta link %s to the open home page',
    (url) => {
      window.history.pushState({}, '', url);
      render(<App />);
      expect(screen.getByText(/HomePage Mock/i)).toBeInTheDocument();
      expect(window.location.pathname).toBe('/');
      window.history.pushState({}, '', '/');
    },
  );

  test('legacy Forecast redirect preserves search, hash, and existing router state', async () => {
    const DestinationProbe = () => {
      const location = useLocation();
      return <output data-testid="redirect-location">{JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        state: location.state,
      })}</output>;
    };

    render(
      <MemoryRouter initialEntries={[{
        pathname: '/forecast',
        search: '?source=bookmark',
        hash: '#day-2',
        state: { openedFrom: 'saved-link' },
      }]}>
        <Routes>
          <Route path="/forecast" element={<ForecastLegacyRedirect />} />
          <Route path="/forecast/severe" element={<DestinationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('redirect-location')).toHaveTextContent(JSON.stringify({
      pathname: '/forecast/severe',
      search: '?source=bookmark',
      hash: '#day-2',
      state: { openedFrom: 'saved-link', legacyForecastRedirect: true },
    }));
  });
});
