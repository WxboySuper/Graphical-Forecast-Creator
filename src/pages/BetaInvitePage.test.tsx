import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BetaInvitePage from './BetaInvitePage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;

const renderBetaInvite = (entry = '/beta-access/discord-invite?t=secret-token') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/beta" element={<div>Beta Landing</div>} />
        <Route path="/beta-access/:invitePath?" element={<BetaInvitePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('BetaInvitePage', () => {
  beforeEach(() => {
    globalThis.__GFC_BETA_MODE__ = true;
    globalThis.__GFC_BETA_INVITE_PATH__ = 'discord-invite';
  });

  test('shows an invite-required state when the onboarding url is invalid', () => {
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      refreshBetaAccess: jest.fn(),
      status: 'signed_out',
      user: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      error: null,
    });

    renderBetaInvite('/beta-access/wrong-path');

    expect(screen.getByText(/Invite required/i)).toBeInTheDocument();
  });

  test('shows the activation card for a signed-in account without beta access', () => {
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      refreshBetaAccess: jest.fn(),
      status: 'signed_in',
      user: {
        email: 'tester@example.com',
        getIdToken: jest.fn(),
      },
    });

    renderBetaInvite();

    expect(screen.getByText(/Activate access for this account/i)).toBeInTheDocument();
    expect(screen.getByText(/tester@example.com/i)).toBeInTheDocument();
  });
});
