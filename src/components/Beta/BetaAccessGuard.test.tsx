import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BetaAccessGuard from './BetaAccessGuard';
import { useAuth } from '../../auth/AuthProvider';
import { isBetaModeEnabled, isLocalBetaBypassEnabled } from '../../lib/betaAccess';

// Mock useAuth
jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

// Mock lib/betaAccess
jest.mock('../../lib/betaAccess', () => ({
  isBetaModeEnabled: jest.fn(),
  isLocalBetaBypassEnabled: jest.fn(),
}));

// Mock BetaPageLayout
jest.mock('./BetaPageLayout', () => ({
  BetaStatusPanel: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('BetaAccessGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderGuard = (initialEntries = ['/protected']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<BetaAccessGuard />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/beta" element={<div>Beta Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it.each([
    ['renders children if beta mode is disabled', false, false, {}, 'Protected Content'],
    ['renders children if local beta bypass is enabled', true, true, {}, 'Protected Content'],
    [
      'renders children if signed in and has beta access',
      true,
      false,
      {
        hostedAuthEnabled: true,
        status: 'signed_in',
        betaAccessLoading: false,
        betaAccess: true,
      },
      'Protected Content',
    ],
  ])('%s', (_name, betaEnabled, bypassEnabled, authState, expectedText) => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(betaEnabled);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(bypassEnabled);
    (useAuth as jest.Mock).mockReturnValue(authState);

    renderGuard();
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it.each([
    [
      'redirects to /beta if hosted auth is disabled',
      {
        hostedAuthEnabled: false,
      },
    ],
    [
      'redirects to /beta if signed out',
      {
        hostedAuthEnabled: true,
        status: 'signed_out',
        betaAccessLoading: false,
      },
    ],
  ])('%s', (_name, authState) => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue(authState);

    renderGuard();
    expect(screen.getByText('Beta Page')).toBeInTheDocument();
  });

  it.each([
    [
      'shows checking status when status is loading',
      { hostedAuthEnabled: true, status: 'loading', betaAccessLoading: false },
    ],
    [
      'shows checking status when betaAccessLoading is true',
      { hostedAuthEnabled: true, status: 'signed_in', betaAccessLoading: true },
    ],
  ])('%s', (_name, authState) => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue(authState);

    renderGuard();
    expect(screen.getByText('Checking beta access')).toBeInTheDocument();
  });
});
