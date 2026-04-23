import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';
import appModeReducer from '../../store/appModeSlice';
import forecastReducer from '../../store/forecastSlice';
import themeReducer from '../../store/themeSlice';
import AppLayout from './AppLayout';

const createMockStore = () =>
  configureStore({
    reducer: {
      appMode: appModeReducer,
      forecast: forecastReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <Provider store={createMockStore()}>
        {ui}
      </Provider>
    </BrowserRouter>
  );
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => React.createElement('div', { 'data-testid': 'test-content' }),
  useNavigate: () => jest.fn(),
  Link: ({ children }: any) => React.createElement('a', null, children),
}));

jest.mock('../AlertBanner', () => ({
  AlertBanner: () => React.createElement('div', { 'data-testid': 'alert-banner' }),
}));

jest.mock('../Documentation/Documentation', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'docs' }),
}));

jest.mock('../Toast/Toast', () => ({
  ToastManager: () => React.createElement('div', { 'data-testid': 'toast' }),
}));

jest.mock('../ToS/ToSModal', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'tos' }),
}));

jest.mock('../PrivacyPolicy/PrivacyPolicyModal', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'privacy' }),
}));

describe('AppLayout', () => {
  it.skip('renders children within the app layout', () => {
    renderWithRouter(
      <AppLayout>
        <div data-testid="test-content">Test Content Here</div>
      </AppLayout>
    );
    
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });
  it.skip('renders the navbar', () => {
    renderWithRouter(<AppLayout />);
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
  });
});
