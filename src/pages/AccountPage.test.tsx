import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from '../store/forecastSlice';
import { AccountPage } from './AccountPage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: jest.fn(),
}));
jest.mock('../metrics/useUserMetrics', () => ({
  useUserMetrics: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;
const mockUseEntitlement = jest.requireMock('../billing/EntitlementProvider').useEntitlement as jest.Mock;
const mockUseUserMetrics = jest.requireMock('../metrics/useUserMetrics').useUserMetrics as jest.Mock;
let store: ReturnType<typeof configureStore>;

describe('AccountPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseEntitlement.mockReturnValue({
      entitlementStatus: 'free',
      premiumActive: false,
      planInterval: null,
      billingStatus: 'inactive',
      effectiveSource: 'none',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      betaOverrideActive: false,
      checkoutEnabled: false,
      billingEnabled: false,
      annualPromoActive: false,
      monthlyDisplayPrice: '$3/month',
      annualDisplayPrice: '$30/year',
      error: null,
      openCheckout: jest.fn(),
      openBillingPortal: jest.fn(),
    });
    mockUseUserMetrics.mockReturnValue({
      metrics: {
        uid: 'user-1',
        activeDayStreak: 4,
        totalActiveDays: 10,
        cyclesCreated: 3,
        cloudCyclesSaved: 2,
        discussionsWritten: 1,
        verificationSessionsRun: 5,
        lastActiveDate: '2026-03-30',
        updatedAt: null,
      },
      loading: false,
      error: null,
    });

    // Create a minimal Redux store used to provide react-redux context for the AccountPage and its children.
    store = configureStore({
      reducer: { forecast: forecastReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
    });
  });

  test.each([
    {
      name: 'shows the local-only fallback when hosted auth is disabled',
      authState: {
        hostedAuthEnabled: false,
        status: 'disabled',
        settingsSyncStatus: 'disabled',
        user: null,
        syncedSettings: null,
        error: null,
        signInWithGoogle: jest.fn(),
        signInWithEmail: jest.fn(),
        signUpWithEmail: jest.fn(),
        signOutUser: jest.fn(),
        updateSyncedSettings: jest.fn(),
      },
      assertion: () => {
        expect(screen.getByRole('heading', { name: /^Account$/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Local-only mode/i })).toBeInTheDocument();
        expect(screen.getByText(/running in local-only mode/i)).toBeInTheDocument();
      },
    },
    {
      name: 'shows confirm password only in create-account mode',
      authState: {
        hostedAuthEnabled: true,
        status: 'signed_out',
        settingsSyncStatus: 'idle',
        user: null,
        syncedSettings: null,
        error: null,
        signInWithGoogle: jest.fn(),
        signInWithEmail: jest.fn(),
        signUpWithEmail: jest.fn(),
        signOutUser: jest.fn(),
        updateSyncedSettings: jest.fn(),
      },
      assertion: () => {
        expect(screen.queryByLabelText(/Confirm Password/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));
        expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
      },
    },
  ])('$name', ({ authState, assertion }) => {
    mockUseAuth.mockReturnValue(authState);

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>
    );

    assertion();
  });

  test('shows a simplified signed-in account view with one sync status badge', () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      settingsSyncStatus: 'synced',
      betaAccess: false,
      user: {
        email: 'alex@example.com',
        displayName: 'Alex',
        providerData: [{ providerId: 'google.com' }],
      },
      syncedSettings: {
        defaultForecasterName: 'Alex',
      },
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      updateSyncedSettings: jest.fn(),
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>
    );

    expect(screen.getAllByText('alex@example.com')).toHaveLength(2);
    expect(screen.getAllByText('Google')).toHaveLength(2);
    expect(screen.getByDisplayValue('Alex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
    expect(screen.getAllByText(/^Synced$/i)).toHaveLength(1);
    expect(screen.getByRole('link', { name: /View Pricing/i })).toBeInTheDocument();
    expect(screen.getByText(/^4$/)).toBeInTheDocument();
    expect(screen.getByText(/^10$/)).toBeInTheDocument();
  });

  test('lets beta users switch the Forecast workspace experiment from account settings', async () => {
    const user = userEvent.setup();
    const updateSyncedSettings = jest.fn().mockImplementation(() => Promise.resolve());

    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      settingsSyncStatus: 'synced',
      betaAccess: true,
      user: {
        email: 'alex@example.com',
        displayName: 'Alex',
        providerData: [{ providerId: 'google.com' }],
      },
      syncedSettings: {
        defaultForecasterName: 'Alex',
        forecastUiVariant: 'integrated',
      },
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      updateSyncedSettings,
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>
    );

    const tabButton = screen.getByRole('button', { name: /tabbed toolbar/i });
    expect(tabButton).toBeInTheDocument();
    await user.click(tabButton);

    expect(updateSyncedSettings).toHaveBeenCalledWith({ forecastUiVariant: 'tabbed_toolbar' });
    expect(await screen.findByText(/will open by default on Forecast/i)).toBeInTheDocument();
  });
});
