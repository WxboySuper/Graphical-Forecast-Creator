import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import ForecastPage from './ForecastPage';
import forecastReducer from '../store/forecastSlice';
import featureFlagsReducer from '../store/featureFlagsSlice';
import overlaysReducer from '../store/overlaysSlice';
import stormReportsReducer from '../store/stormReportsSlice';
import appModeReducer from '../store/appModeSlice';
import themeReducer from '../store/themeSlice';
import verificationReducer from '../store/verificationSlice';

const mockAddToast = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('../components/Map/ForecastMap', () => {
  const { forwardRef } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: forwardRef(() => <div>ForecastMap Mock</div>),
  };
});

jest.mock('../components/ForecastWorkspace/ForecastWorkspaceLayouts', () => ({
  ForecastTabbedToolbarLayout: () => <div>ForecastTabbedToolbarLayout Mock</div>,
}));

jest.mock('../components/ForecastWorkspace/ForecastWorkspaceModals', () => () => null);

jest.mock('../hooks/useAutoSave', () => ({
  useAutoSave: jest.fn(),
}));

jest.mock('../hooks/useAutoCategorical', () => jest.fn());
jest.mock('../utils/cycleHistoryPersistence', () => ({
  useCycleHistoryPersistence: jest.fn(),
}));
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: () => ({ premiumActive: false, effectiveSource: 'none' }),
}));
jest.mock('../hooks/useCloudCycles', () => ({
  useCloudCycles: () => ({
    currentCloud: null,
    saveCycle: jest.fn(),
    markAsCurrent: jest.fn(),
  }),
}));
jest.mock('../hooks/useCloudSync', () => ({
  useCloudSync: () => ({
    markCurrentStateSynced: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    addToast: mockAddToast,
  }),
}));

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
    featureFlags: featureFlagsReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});


const renderForecastPage = (store: ReturnType<typeof createStore>) =>
  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastPage />
      </Provider>
    </MemoryRouter>
  );


describe('ForecastPage layout selection', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockUseAuth.mockReturnValue({ user: null, syncedSettings: null });
  });

  test('defaults to the tabbed toolbar layout when no local override is present', () => {
    const store = createStore();
    renderForecastPage(store);

    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
  });

  test('query string or stored/remote overrides resolve to the tabbed toolbar when other variants are removed', () => {
    const store = createStore();
    localStorage.setItem('gfc-forecast-ui-variant', 'floating_panels');

    const first = render(
      <MemoryRouter initialEntries={['/forecast?forecastUi=workspace_dock']}>
        <Provider store={store}>
          <ForecastPage />
        </Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    first.unmount();

    localStorage.setItem('gfc-forecast-ui-variant', 'floating_panels');
    const second = renderForecastPage(store);
    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    second.unmount();

    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1' },
      syncedSettings: { forecastUiVariant: 'workspace_dock' },
    });

    const third = renderForecastPage(store);
    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    third.unmount();
  });
});
