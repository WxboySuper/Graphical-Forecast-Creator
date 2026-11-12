import { render, screen } from '@testing-library/react';
import { ExternalRedirect } from './ExternalRedirect';

describe('ExternalRedirect', () => {
  it('navigates to the target and renders a fallback link', () => {
    const navigate = jest.fn();

    render(<ExternalRedirect to="https://gfcweather.com/pricing/" label="pricing" navigate={navigate} />);

    expect(navigate).toHaveBeenCalledWith('https://gfcweather.com/pricing/');
    expect(screen.getByRole('link', { name: /continue to pricing/i })).toHaveAttribute('href', 'https://gfcweather.com/pricing/');
  });
});
