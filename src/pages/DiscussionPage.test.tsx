import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DiscussionPage } from './DiscussionPage';
import forecastReducer from '../store/forecastSlice';
import featureFlagsReducer from '../store/featureFlagsSlice';
import overlaysReducer from '../store/overlaysSlice';
import stormReportsReducer from '../store/stormReportsSlice';
import appModeReducer from '../store/appModeSlice';
import themeReducer from '../store/themeSlice';
import verificationReducer from '../store/verificationSlice';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    addToast: jest.fn(),
  }),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;

const createStore = () =>
  configureStore({
    reducer: {
      forecast: forecastReducer,
      featureFlags: featureFlagsReducer,
      overlays: overlaysReducer,
      stormReports: stormReportsReducer,
      appMode: appModeReducer,
      theme: themeReducer,
      verification: verificationReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

describe('DiscussionPage', () => {
  test('uses the synced default forecaster name when no discussion exists yet', () => {
    mockUseAuth.mockReturnValue({
      syncedSettings: {
        defaultForecasterName: 'WeatherboySuper',
      },
      user: {
        displayName: 'Fallback Name',
      },
    });

    render(
      <Provider store={createStore()}>
        <DiscussionPage />
      </Provider>
    );

    expect(screen.getByDisplayValue('WeatherboySuper')).toBeInTheDocument();
  });
});
