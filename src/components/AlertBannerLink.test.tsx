import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlertBannerLink } from './AlertBannerLink';

describe('AlertBannerLink', () => {
  test('renders internal route link', () => {
    render(
      <MemoryRouter>
        <AlertBannerLink linkUrl="/updates" linkLabel="What's new" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: "What's new" })).toHaveAttribute('href', '/updates');
  });

  test('renders external link in a new tab', () => {
    render(<AlertBannerLink linkUrl="https://example.com/status" linkLabel="Status" />);

    const link = screen.getByRole('link', { name: 'Status' });
    expect(link).toHaveAttribute('href', 'https://example.com/status');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('treats protocol-relative URLs as external', () => {
    render(<AlertBannerLink linkUrl="//example.com/status" linkLabel="Status" />);

    expect(screen.getByRole('link', { name: 'Status' })).toHaveAttribute('href', '//example.com/status');
  });
});
