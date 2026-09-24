import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UnavailableForecastWorkspacePage } from './UnavailableForecastWorkspacePage';

describe('UnavailableForecastWorkspacePage', () => {
  test('explains a known but unexposed workspace without mounting an editor', () => {
    render(
      <MemoryRouter>
        <UnavailableForecastWorkspacePage workspaceId="tropical" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Tropical forecast is not available yet',
    );
    expect(screen.getByText(/not enabled in this build/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /severe forecast/i })).toHaveAttribute(
      'href',
      '/forecast/severe',
    );
  });

  test('labels each gated workspace separately', () => {
    render(
      <MemoryRouter>
        <UnavailableForecastWorkspacePage workspaceId="mesoscale" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Mesoscale forecast is not available yet',
    );
  });
});
