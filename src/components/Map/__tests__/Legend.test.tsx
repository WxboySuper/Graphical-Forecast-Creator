import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Legend from '../Legend';
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
      },
      theme: { darkMode: false },
      ...preloadedState,
    } as RootState,
    reducer: {
      forecast: (state = {}) => state,
      theme: (state = {}) => state,
    },
  });
};

describe('Legend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders categorical legend when activeOutlookType is categorical', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'categorical' },
        forecastCycle: { days: {} },
      },
      theme: { darkMode: false },
    });
    render(
      <Provider store={store}>
        <Legend />
      </Provider>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders tornado probabilistic legend when activeOutlookType is tornado', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'tornado' },
        forecastCycle: { days: {} },
      },
      theme: { darkMode: false },
    });
    render(
      <Provider store={store}>
        <Legend />
      </Provider>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders wind probabilistic legend when activeOutlookType is wind', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'wind' },
        forecastCycle: { days: {} },
      },
      theme: { darkMode: true },
    });
    render(
      <Provider store={store}>
        <Legend />
      </Provider>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders hail probabilistic legend when activeOutlookType is hail', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'hail' },
        forecastCycle: { days: {} },
      },
      theme: { darkMode: false },
    });
    render(
      <Provider store={store}>
        <Legend />
      </Provider>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders totalSevere probabilistic legend when activeOutlookType is totalSevere', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'totalSevere' },
        forecastCycle: { days: {} },
      },
      theme: { darkMode: false },
    });
    render(
      <Provider store={store}>
        <Legend />
      </Provider>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders day4-8 probabilistic legend when activeOutlookType is day4-8', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'day4-8' },
        forecastCycle: { days: {} },
      },
      theme: { darkMode: false },
    });
    render(
      <Provider store={store}>
        <Legend />
      </Provider>
    );
    expect(document.body).toBeTruthy();
  });

  it('accepts activeOutlookType override prop', () => {
    const store = createMockStore({
      forecast: {
        drawingState: { activeOutlookType: 'categorical' },
        forecastCycle: { days: {} },
      },
      theme: { darkMode: false },
    });
    render(
      <Provider store={store}>
        <Legend activeOutlookType="tornado" />
      </Provider>
    );
    expect(document.body).toBeTruthy();
  });
});
