import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminPage } from './AdminPage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;
const mockFetch = jest.fn();

const renderAdminPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/account" element={<div>Account Page</div>} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('AdminPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  test('redirects to home when hosted auth is disabled', () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: false,
      status: 'disabled',
      user: null,
    });

    renderAdminPage();

    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  test('redirects signed-out users to account', () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_out',
      user: null,
    });

    renderAdminPage();

    expect(screen.getByText('Account Page')).toBeInTheDocument();
  });

  test('redirects forbidden users away from admin', async () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      user: {
        getIdToken: jest.fn().mockResolvedValue('token-123'),
      },
    });
    mockFetch.mockResolvedValue({
      status: 403,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'forbidden' }),
    });

    renderAdminPage();

    await waitFor(() => expect(screen.getByText('Home Page')).toBeInTheDocument());
  });

  test('renders summary data for allowlisted admins', async () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      user: {
        getIdToken: jest.fn().mockResolvedValue('token-123'),
      },
    });
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        metricsEnabled: true,
        window: 7,
        summary: {
          totalAccounts: 2,
          signIns: 3,
          premiumSubscriptions: 1,
          storageBytes: 1024,
          signups: 1,
          upgrades: 0,
          cancellations: 0,
          cloudSaves: 2,
          cloudLoads: 1,
          activeDevices: 1,
        },
        dailyMetrics: [],
      }),
    });

    renderAdminPage();

    await waitFor(() => expect(screen.getByText(/1(\.0)? KB/)).toBeInTheDocument());
    expect(screen.getByText('Total accounts')).toBeInTheDocument();
    expect(screen.getByText('Premium subscriptions')).toBeInTheDocument();
    expect(screen.getByText('Hosted data footprint')).toBeInTheDocument();
  });
});
