import { render, screen } from '@testing-library/react';
import HomeHero from './HomeHero';

describe('HomeHero', () => {
  const baseProps = {
    formattedDate: 'Friday, March 27, 2026',
    hasSavedCycles: true,
    savedCyclesCount: 3,
    onStart: jest.fn(),
    onWriteDiscussion: jest.fn(),
    onViewAccount: jest.fn(),
    onOpenHistory: jest.fn(),
  };

  test('shows onboarding-focused copy for signed-out users', () => {
    render(<HomeHero {...baseProps} variant="signed_out" />);

    expect(screen.getByText(/Build outlook packages without fighting the tooling/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Forecast/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Account & Sync/i })).toBeInTheDocument();
    expect(screen.getByText(/What This Helps With/i)).toBeInTheDocument();
  });

  test('shows resume-focused copy for signed-in users', () => {
    render(<HomeHero {...baseProps} variant="signed_in" />);

    expect(screen.getByText(/Pick up the next cycle without hunting through menus/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue Forecast/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Saved Cycles/i })).toBeInTheDocument();
    expect(screen.getByText(/Today In GFC/i)).toBeInTheDocument();
  });
});
