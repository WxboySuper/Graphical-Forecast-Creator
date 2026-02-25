import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DrawingTools from './DrawingTools';
import forecastReducer from '../../store/forecastSlice';
import featureFlagsReducer from '../../store/featureFlagsSlice';
import { ForecastMapHandle } from '../Map/ForecastMap';

// Mock modals that require AppLayout context
jest.mock('../CycleManager/CycleHistoryModal', () => () => <div>CycleHistoryModal Mock</div>);
jest.mock('../CycleManager/CopyFromPreviousModal', () => () => <div>CopyFromPreviousModal Mock</div>);

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
  const mockOnOpenDiscussion = jest.fn();
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
        onOpenDiscussion={mockOnOpenDiscussion}
        mapRef={mockMapRef}
        addToast={mockAddToast}
      />
    );

    expect(screen.getByLabelText('Save Forecast')).toBeInTheDocument();
    expect(screen.getByLabelText('Load Forecast')).toBeInTheDocument();
    expect(screen.getByLabelText('Forecast Discussion')).toBeInTheDocument();
    expect(screen.getByLabelText('Export as Image')).toBeInTheDocument();
    expect(screen.getByLabelText('Reset All')).toBeInTheDocument();
  });
});
