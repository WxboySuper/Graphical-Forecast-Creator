import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import OverlayControls from '../OverlayControls';
import overlaysReducer, { toggleStateBorders, toggleCounties } from '../../../store/overlaysSlice';

const createMockStore = (preloadedState = {}) => {
  return configureStore({
    preloadedState: {
      overlays: {
        stateBorders: true,
        counties: false,
        baseMapStyle: 'osm' as const,
        ghostOutlooks: {
          tornado: false,
          wind: false,
          hail: false,
          categorical: false,
          totalSevere: false,
          'day4-8': false,
        },
        ...preloadedState,
      },
    },
    reducer: {
      overlays: overlaysReducer,
    },
  });
};

describe('OverlayControls', () => {
  it('renders state borders checkbox checked by default', () => {
    const store = createMockStore({ stateBorders: true });
    render(
      <Provider store={store}>
        <OverlayControls />
      </Provider>
    );
    const checkbox = screen.getByRole('checkbox', { name: /state borders/i });
    expect(checkbox).toBeTruthy();
  });

  it('renders counties checkbox unchecked by default', () => {
    const store = createMockStore({ counties: false });
    render(
      <Provider store={store}>
        <OverlayControls />
      </Provider>
    );
    const checkbox = screen.getByRole('checkbox', { name: /counties/i });
    expect(checkbox).toBeTruthy();
  });

  it('toggles state borders when clicked', () => {
    const store = createMockStore({ stateBorders: true });
    render(
      <Provider store={store}>
        <OverlayControls />
      </Provider>
    );
    const checkbox = screen.getByRole('checkbox', { name: /state borders/i });
    fireEvent.click(checkbox);
    expect(store.getState().overlays.stateBorders).toBe(false);
  });

  it('toggles counties when clicked', () => {
    const store = createMockStore({ counties: false });
    render(
      <Provider store={store}>
        <OverlayControls />
      </Provider>
    );
    const checkbox = screen.getByRole('checkbox', { name: /counties/i });
    fireEvent.click(checkbox);
    expect(store.getState().overlays.counties).toBe(true);
  });

  it('renders header label', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <OverlayControls />
      </Provider>
    );
    expect(document.body.textContent).toContain('Boundaries');
  });
});
