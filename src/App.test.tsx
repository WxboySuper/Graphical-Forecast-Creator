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
jest.mock('./pages/PricingPage', () => ({
  __esModule: true,
  default: () => <div>PricingPage Mock</div>,
}));
jest.mock('./pages/UpdatesPage', () => ({
  UpdatesPage: () => <div>UpdatesPage Mock</div>,
}));
jest.mock('./pages/BetaLandingPage', () => ({
  __esModule: true,
  default: () => <div>BetaLandingPage Mock</div>,
}));
jest.mock('./pages/BetaInvitePage', () => ({
  __esModule: true,
  default: () => <div>BetaInvitePage Mock</div>,
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
jest.mock('./components/Beta/BetaAccessGuard', () => () => <MockOutlet />);
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
