import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BetaAccessGuard from './BetaAccessGuard';

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../../auth/AuthProvider').useAuth as jest.Mock;

const renderGuard = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/beta" element={<div>Beta Landing</div>} />
        <Route element={<BetaAccessGuard />}>
          <Route path="/forecast" element={<div>Forecast Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('BetaAccessGuard local bypass', () => {
  beforeEach(() => {
    globalThis.__GFC_BETA_MODE__ = true;
    localStorage.clear();
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      status: 'signed_out',
    });
  });

  test('allows localhost sessions through the beta gate when the local bypass query flag is enabled', () => {
    renderGuard('/forecast?localBetaBypass=1');

    expect(screen.getByText('Forecast Page')).toBeInTheDocument();
  });

  test('still redirects to the beta landing page without the local bypass', () => {
    renderGuard('/forecast');

    expect(screen.getByText('Beta Landing')).toBeInTheDocument();
  });
});
