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

  test('renders children if beta mode is disabled', () => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue({});

    renderGuard();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  test('renders children if local beta bypass is enabled', () => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(true);
    (useAuth as jest.Mock).mockReturnValue({});

    renderGuard();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  test('redirects to /beta if hosted auth is disabled', () => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue({ hostedAuthEnabled: false });

    renderGuard();
    expect(screen.getByText('Beta Page')).toBeInTheDocument();
  });

  test('shows checking status when status is loading', () => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'loading',
      betaAccessLoading: false,
    });

    renderGuard();
    expect(screen.getByText('Checking beta access')).toBeInTheDocument();
  });

  test('shows checking status when betaAccessLoading is true', () => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      betaAccessLoading: true,
    });

    renderGuard();
    expect(screen.getByText('Checking beta access')).toBeInTheDocument();
  });

  test('renders children if signed in and has beta access', () => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      betaAccessLoading: false,
      betaAccess: true,
    });

    renderGuard();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  test('redirects to /beta if signed out', () => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_out',
      betaAccessLoading: false,
    });

    renderGuard();
    expect(screen.getByText('Beta Page')).toBeInTheDocument();
  });
});
