import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AccountPage } from './AccountPage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;

describe('AccountPage', () => {
  test('shows the local-only fallback when hosted auth is disabled', () => {
    mockUseAuth.mockReturnValue({
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
    });

    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: /^Account$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Local-only mode/i })).toBeInTheDocument();
    expect(screen.getByText(/running in local-only mode/i)).toBeInTheDocument();
  });

  test('shows confirm password only in create-account mode', () => {
    mockUseAuth.mockReturnValue({
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
    });

    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    expect(screen.queryByLabelText(/Confirm Password/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
  });

  test('shows a simplified signed-in account view with one sync status badge', () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      settingsSyncStatus: 'synced',
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
        <AccountPage />
      </BrowserRouter>
    );

    expect(screen.getAllByText('alex@example.com')).toHaveLength(2);
    expect(screen.getAllByText('Google')).toHaveLength(2);
    expect(screen.getByDisplayValue('Alex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
    expect(screen.getAllByText(/^Synced$/i)).toHaveLength(1);
  });
});
