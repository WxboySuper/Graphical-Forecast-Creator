import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from '../../store/forecastSlice';
import themeReducer from '../../store/themeSlice';
import Legend from './Legend';

const createMockStore = (preloadedState = {}) =>
  configureStore({
    reducer: {
      forecast: forecastReducer,
      theme: themeReducer,
    },
    preloadedState,
  });

describe('Legend', () => {
  it('renders the legend component without crashing', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'categorical' },
        uiVariant: 'standard',
      },
      theme: { darkMode: false },
    });
    
    render(
      <Provider store={store}>
        <Legend />
      </Provider>
    );
    
    // Legend should render its title
    expect(screen.getByText(/categorical risk levels/i)).toBeInTheDocument();
  });

  it('renders tornado outlook type', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'tornado' },
        uiVariant: 'standard',
      },
      theme: { darkMode: false },
    });
    
    render(
      <Provider store={store}>
        <Legend activeOutlookType="tornado" />
      </Provider>
    );
    
    expect(screen.getByText(/tornado/i)).toBeInTheDocument();
  });
});