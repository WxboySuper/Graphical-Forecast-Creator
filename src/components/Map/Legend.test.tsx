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

  it('marks the legend as open for the mobile popout state', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'tornado' },
        uiVariant: 'standard',
      },
      theme: { darkMode: false },
    });

    render(
      <Provider store={store}>
        <Legend activeOutlookType="tornado" mobileOpen />
      </Provider>
    );

    expect(screen.getByRole('complementary', { name: /map legend/i })).toHaveClass('map-legend--mobile-open');
  });

  it('marks the legend as hidden when the desktop key is toggled off', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'tornado' },
        uiVariant: 'standard',
      },
      theme: { darkMode: false },
    });

    render(
      <Provider store={store}>
        <Legend activeOutlookType="tornado" desktopOpen={false} />
      </Provider>
    );

    expect(screen.getByRole('complementary', { name: /map legend/i })).toHaveClass('map-legend--desktop-hidden');
  });

  it.each([
    ['wind', /wind probabilities/i, /90%/i, /CIG3 \(Hatching\)/i],
    ['hail', /hail probabilities/i, /60%/i, /CIG2 \(Hatching\)/i],
    ['totalSevere', /totalsevere probabilities/i, /45%/i, /CIG1 \(Hatching\)/i],
    ['day4-8', /day4-8 probabilities/i, /15%/i, /30%/i],
  ] as const)('renders %s probability entries', (activeOutlookType, title, firstEntry, secondEntry) => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType },
        uiVariant: 'standard',
      },
      theme: { darkMode: false },
    });

    render(
      <Provider store={store}>
        <Legend activeOutlookType={activeOutlookType} />
      </Provider>
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(firstEntry)).toBeInTheDocument();
    expect(screen.getByText(secondEntry)).toBeInTheDocument();
  });

  it('uses dark-mode styling for hatch swatches', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'tornado' },
        uiVariant: 'standard',
      },
      theme: { darkMode: true },
    });

    render(
      <Provider store={store}>
        <Legend activeOutlookType="tornado" />
      </Provider>
    );

    expect(screen.getByRole('img', { name: /Legend for CIG1/i })).toHaveStyle({
      border: '1px solid rgba(255,255,255,0.55)',
    });
  });
});
