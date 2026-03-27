import { render, screen } from '@testing-library/react';
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

    expect(screen.getByText(/Hosted Accounts Are Disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/running in local-only mode/i)).toBeInTheDocument();
  });
});
