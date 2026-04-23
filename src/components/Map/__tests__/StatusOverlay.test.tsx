import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import StatusOverlay from '../StatusOverlay';
import forecastReducer, { setLowProbabilityMode } from '../../../store/forecastSlice';
import { RootState } from '../../../store';

const createMockStore = (preloadedState: Partial<RootState> = {}) => {
  return configureStore({
    preloadedState: {
      forecast: {
        drawingState: {
          activeOutlookType: 'categorical',
          activeProbability: null,
          isDrawing: false,
          currentDrawTool: null,
        },
        forecastCycle: { days: {} },
        isLowProbability: false,
        ...preloadedState,
      } as RootState['forecast'],
      theme: { darkMode: false },
    } as RootState,
    reducer: {
      forecast: forecastReducer,
      theme: (state = { darkMode: false }) => state,
    },
  });
};

describe('StatusOverlay', () => {
  it('renders null when isLowProbability is false', () => {
    const store = createMockStore({ isLowProbability: false });
    const { container } = render(
      <Provider store={store}>
        <StatusOverlay />
      </Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders overlay when isLowProbability is true and activeOutlook is categorical', () => {
    const store = createMockStore({ isLowProbability: true });
    const { container } = render(
      <Provider store={store}>
        <StatusOverlay />
      </Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders overlay when isLowProbability is true and activeOutlook is probabilistic', () => {
    const store = configureStore({
      preloadedState: {
        forecast: {
          drawingState: {
            activeOutlookType: 'tornado',
            activeProbability: null,
            isDrawing: false,
            currentDrawTool: null,
          },
          forecastCycle: { days: {} },
          isLowProbability: true,
        },
        theme: { darkMode: false },
      } as RootState,
      reducer: {
        forecast: forecastReducer,
        theme: (state = { darkMode: false }) => state,
      },
    });
    const { container } = render(
      <Provider store={store}>
        <StatusOverlay />
      </Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
