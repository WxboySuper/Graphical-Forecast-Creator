import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DrawingTools from './DrawingTools';
import forecastReducer from '../../store/forecastSlice';
import featureFlagsReducer from '../../store/featureFlagsSlice';
import { ForecastMapHandle } from '../Map/ForecastMap';

// Mock Leaflet map
const mockMap = {
  getMap: jest.fn(),
};

const renderWithStore = (
  component: React.ReactElement,
  initialState = {}
) => {
  const store = configureStore({
    reducer: {
      forecast: forecastReducer,
      featureFlags: featureFlagsReducer,
    },
    preloadedState: initialState,
  });

  return {
    ...render(<Provider store={store}>{component}</Provider>),
    store,
  };
};

describe('DrawingTools', () => {
  const mockOnSave = jest.fn();
  const mockOnLoad = jest.fn();
  const mockAddToast = jest.fn();
  const mockMapRef = { current: mockMap } as unknown as React.RefObject<ForecastMapHandle>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders buttons with correct aria-labels', () => {
    renderWithStore(
      <DrawingTools
        onSave={mockOnSave}
        onLoad={mockOnLoad}
        mapRef={mockMapRef}
        addToast={mockAddToast}
      />
    );

    expect(screen.getByLabelText('Save Forecast')).toBeInTheDocument();
    expect(screen.getByLabelText('Load Forecast')).toBeInTheDocument();
    expect(screen.getByLabelText('Export as Image')).toBeInTheDocument();
    expect(screen.getByLabelText('Reset All')).toBeInTheDocument();
  });

  test('calls addToast when map reference is missing', () => {
    const initialState = {
      featureFlags: {
        exportMapEnabled: true,
        saveLoadEnabled: true,
        tornadoOutlookEnabled: true,
        windOutlookEnabled: true,
        hailOutlookEnabled: true,
        categoricalOutlookEnabled: true,
        significantThreatsEnabled: true,
      }
    };

    const nullMapRef = { current: null } as React.RefObject<ForecastMapHandle>;

    renderWithStore(
      <DrawingTools
        onSave={mockOnSave}
        onLoad={mockOnLoad}
        mapRef={nullMapRef}
        addToast={mockAddToast}
      />,
      initialState
    );

    const exportButton = screen.getByLabelText('Export as Image');
    expect(exportButton).not.toBeDisabled();

    fireEvent.click(exportButton);

    expect(mockAddToast).toHaveBeenCalledWith(
      'Map reference not available. Cannot export.',
      'error'
    );
  });
});
