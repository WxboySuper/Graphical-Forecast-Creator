import { render, screen } from '@testing-library/react';
import { RouteFallback } from './RouteFallback';

describe('RouteFallback', () => {
  it('announces a visible loading status', () => {
    render(<RouteFallback />);
    const status = screen.getByRole('status', { name: 'Loading page' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading…');
  });

  it('accepts a page-specific label', () => {
    render(<RouteFallback label="Loading Forecast Grade" />);
    expect(screen.getByRole('status', { name: 'Loading Forecast Grade' })).toBeInTheDocument();
  });
});
