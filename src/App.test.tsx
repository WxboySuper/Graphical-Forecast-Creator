const React = require('react');
const { render, screen } = require('@testing-library/react');

// Mock pages to avoid importing heavy modules (OpenLayers / ol-mapbox-style) during App tests
jest.mock('./pages', () => {
  const React = require('react');
  return {
    HomePage: () => React.createElement('div', null, 'HomePage Mock'),
    ForecastPage: () => React.createElement('div', null, 'ForecastPage Mock'),
    DiscussionPage: () => React.createElement('div', null, 'DiscussionPage Mock'),
    VerificationPage: () => React.createElement('div', null, 'VerificationPage Mock'),
    ComingSoonPage: () => React.createElement('div', null, 'ComingSoonPage Mock'),
    AccountPage: () => React.createElement('div', null, 'AccountPage Mock'),
    PricingPage: () => React.createElement('div', null, 'PricingPage Mock'),
    AdminPage: () => React.createElement('div', null, 'AdminPage Mock'),
    BetaLandingPage: () => React.createElement('div', null, 'BetaLandingPage Mock'),
    BetaInvitePage: () => React.createElement('div', null, 'BetaInvitePage Mock'),
  };
});

// Mock ForecastMap to avoid Leaflet/Geoman issues
jest.mock('./components/Map/ForecastMap', () => {
  // skipcq: JS-0359
  const React = require('react');
  return React.forwardRef(() => React.createElement('div', null, 'ForecastMap Mock'));
});

// Mock other components if necessary (good practice to isolate App testing)
jest.mock('./components/DrawingTools/DrawingTools', () => {
  const React = require('react');
  return () => React.createElement('div', null, 'DrawingTools Mock');
});
jest.mock('./components/Documentation/Documentation', () => {
  const React = require('react');
  return () => React.createElement('div', null, 'Documentation Mock');
});

const App = require('./App').default;

test('renders Graphical Forecast Creator title', () => {
  render(React.createElement(App));
  const titleElements = screen.getAllByText(/Graphical Forecast Creator/i);
  expect(titleElements[0]).toBeInTheDocument();
});
