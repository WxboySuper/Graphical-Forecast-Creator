import { render, screen } from '@testing-library/react';

// Mock pages to avoid importing heavy modules (OpenLayers / ol-mapbox-style) during App tests
jest.mock('./pages', () => ({
  HomePage: () => <div>HomePage Mock</div>,
  ForecastPage: () => <div>ForecastPage Mock</div>,
  DiscussionPage: () => <div>DiscussionPage Mock</div>,
  VerificationPage: () => <div>VerificationPage Mock</div>,
  ComingSoonPage: () => <div>ComingSoonPage Mock</div>,
  AccountPage: () => <div>AccountPage Mock</div>,
  PricingPage: () => <div>PricingPage Mock</div>,
  AdminPage: () => <div>AdminPage Mock</div>,
  BetaLandingPage: () => <div>BetaLandingPage Mock</div>,
  BetaInvitePage: () => <div>BetaInvitePage Mock</div>,
}));

// Mock ForecastMap to avoid Leaflet/Geoman issues
jest.mock('./components/Map/ForecastMap', () => () => <div>ForecastMap Mock</div>);

// Mock other components if necessary (good practice to isolate App testing)
jest.mock('./components/DrawingTools/DrawingTools', () => () => <div>DrawingTools Mock</div>);
jest.mock('./components/Documentation/Documentation', () => () => <div>Documentation Mock</div>);

import App from './App';

test('renders Graphical Forecast Creator title', () => {
  render(<App />);
  const titleElements = screen.getAllByText(/Graphical Forecast Creator/i);
  expect(titleElements[0]).toBeInTheDocument();
});
