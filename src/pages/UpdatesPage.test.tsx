import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UpdatesPage from './UpdatesPage';

describe('UpdatesPage', () => {
  test('renders v1.6 headline and improvement list', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /Monitor/i })).toBeInTheDocument();
    expect(screen.getByText(/What's new · v1\.6/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /light mode with MRMS reflectivity and GOES visible satellite/i })).toHaveAttribute(
      'src',
      '/updates/v1.6/v1.6-promo-image-light-mrms-visible.png',
    );
    expect(screen.getByRole('img', { name: /dark mode with single-site reflectivity and GOES shortwave IR satellite/i })).toHaveAttribute(
      'src',
      '/updates/v1.6/v1.6-promo-image-dark-single-site-shortwave-ir.png',
    );
    expect(screen.getByRole('heading', { name: /Monitor workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/Signed-in home page primary buttons are easier to read/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });
});
