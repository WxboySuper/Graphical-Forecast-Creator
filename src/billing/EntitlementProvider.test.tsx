import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { EntitlementProvider, useEntitlement } from './EntitlementProvider';

// Mock firebase with isHostedAuthEnabled: false so provider skips Firestore entirely
jest.mock('../lib/firebase', () => ({
  db: null,
  requireDb: jest.fn(() => {
    throw new Error('not configured');
  }),
  isHostedAuthEnabled: false,
}));

// Mock useAuth - hosted auth is disabled so status doesn't matter
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: null,
    status: 'signed_out',
    hostedAuthEnabled: false,
    settingsSyncStatus: 'idle',
    syncedSettings: null,
    error: null,
    betaAccess: false,
    betaAccessLoading: false,
    signInWithGoogle: jest.fn(),
    signInWithEmail: jest.fn(),
    signUpWithEmail: jest.fn(),
    signOutUser: jest.fn(),
    updateSyncedSettings: jest.fn(),
    refreshBetaAccess: jest.fn(),
  }),
}));

const TestConsumer = () => {
  const entitlement = useEntitlement();
  return (
    <div>
      <span data-testid="status">{entitlement.entitlementStatus}</span>
      <span data-testid="premium">{String(entitlement.premiumActive)}</span>
    </div>
  );
};

describe('EntitlementProvider', () => {
  it('renders children', async () => {
    await act(async () => {
      render(
        <EntitlementProvider>
          <div data-testid="child">Test Child</div>
        </EntitlementProvider>
      );
    });
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides entitlement context to children', async () => {
    await act(async () => {
      render(
        <EntitlementProvider>
          <TestConsumer />
        </EntitlementProvider>
      );
    });
    expect(screen.getByTestId('status')).toBeInTheDocument();
  });

  it('throws when useEntitlement is used outside provider', () => {
    const BadConsumer = () => {
      useEntitlement();
      return null;
    };
    expect(() => render(<BadConsumer />)).toThrow('useEntitlement must be used within EntitlementProvider');
  });
});