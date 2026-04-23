import { render, screen, act, fireEvent } from '@testing-library/react';
import AlertBanner from './AlertBanner';

describe('AlertBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test('renders alert when enabled', async () => {
    const mockConfig = {
      enabled: true,
      message: 'Test Alert',
      type: 'warning',
      dismissible: true,
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });

    render(<AlertBanner />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('Test Alert')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('alert-banner--warning');
  });

  test('remains hidden when disabled', async () => {
    const mockConfig = { enabled: false, message: 'Hidden', type: 'info', dismissible: true };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });

    render(<AlertBanner />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  test('remains hidden on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Fetch failed'));

    render(<AlertBanner />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('can be dismissed', async () => {
    const mockConfig = {
      enabled: true,
      message: 'Dismiss me',
      type: 'error',
      dismissible: true,
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });

    render(<AlertBanner />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const closeButton = screen.getByLabelText('Dismiss alert');
    fireEvent.click(closeButton);

    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  test('is not dismissible when dismissible is false', async () => {
    const mockConfig = {
      enabled: true,
      message: 'Permanent',
      type: 'info',
      dismissible: false,
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });

    render(<AlertBanner />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByLabelText('Dismiss alert')).not.toBeInTheDocument();
  });

  test('handles non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
    });

    render(<AlertBanner />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
