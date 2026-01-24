import { render, screen } from '@testing-library/react';
import App from './App';

// Mock ForecastMap to avoid Leaflet/Geoman issues
jest.mock('./components/Map/ForecastMap', () => {
  // skipcq: JS-C1003
  const React = require('react');
  return React.forwardRef(() => <div>ForecastMap Mock</div>);
});

// Mock other components if necessary (good practice to isolate App testing)
jest.mock('./components/OutlookPanel/OutlookPanel', () => () => <div>OutlookPanel Mock</div>);
jest.mock('./components/DrawingTools/DrawingTools', () => () => <div>DrawingTools Mock</div>);
jest.mock('./components/Documentation/Documentation', () => () => <div>Documentation Mock</div>);

test('renders Graphical Forecast Creator title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Graphical Forecast Creator/i);
  expect(titleElement).toBeInTheDocument();
});
