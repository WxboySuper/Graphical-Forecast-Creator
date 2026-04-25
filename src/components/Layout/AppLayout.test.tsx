import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  Link: ({ children }: { children: React.ReactNode }) => React.createElement('a', null, children),
}));

jest.mock('../AlertBanner', () => ({
  AlertBanner: () => React.createElement('div', { 'data-testid': 'alert-banner' }),
}));

jest.mock('./Navbar', () => ({
  Navbar: ({
    onToggleDocumentation,
    onViewTerms,
    onViewPrivacyPolicy,
  }: {
    onToggleDocumentation: () => void;
    onViewTerms: () => void;
    onViewPrivacyPolicy: () => void;
  }) =>
    React.createElement('nav', { 'data-testid': 'navbar' }, [
      React.createElement('button', { key: 'docs', onClick: onToggleDocumentation }, 'Docs'),
      React.createElement('button', { key: 'terms', onClick: onViewTerms }, 'Terms'),
      React.createElement('button', { key: 'privacy', onClick: onViewPrivacyPolicy }, 'Privacy'),
    ]),
}));

jest.mock('../Documentation/Documentation', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'docs' }, [
      React.createElement('span', { key: 'label' }, 'Docs panel'),
      React.createElement('button', { key: 'close', onClick: onClose }, 'Close Docs'),
    ]),
}));

jest.mock('../Toast/Toast', () => ({
  ToastManager: ({ toasts, onDismiss }: { toasts: Array<{ id: string; message: string }>; onDismiss: (id: string) => void }) =>
    React.createElement('div', { 'data-testid': 'toast' }, toasts.map((toast) =>
      React.createElement('button', { key: toast.id, onClick: () => onDismiss(toast.id) }, toast.message)
    )),
}));

jest.mock('../ToS/ToSModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'tos' }, React.createElement('button', { onClick: onClose }, 'Close Terms')),
}));

jest.mock('../PrivacyPolicy/PrivacyPolicyModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'privacy' }, React.createElement('button', { onClick: onClose }, 'Close Privacy')),
}));

describe('AppLayout', () => {
  it('renders routed content within the app layout', () => {
    renderWithRouter(<AppLayout />);
    
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('renders the navbar', () => {
    renderWithRouter(<AppLayout />);
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
  });

  it('opens and closes documentation, terms, and privacy viewers', () => {
    renderWithRouter(<AppLayout />);

    fireEvent.click(screen.getByText('Docs'));
    expect(screen.getByTestId('docs')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('docs')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Docs'));
    fireEvent.click(screen.getByText('Close Docs'));
    expect(screen.queryByTestId('docs')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Terms'));
    expect(screen.getByTestId('tos')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Terms'));
    expect(screen.queryByTestId('tos')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Privacy'));
    expect(screen.getByTestId('privacy')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Privacy'));
    expect(screen.queryByTestId('privacy')).not.toBeInTheDocument();
  });
});
