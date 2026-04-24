import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertBanner from './AlertBanner';

describe('AlertBanner', () => {
  const mockBannerFetch = (config: unknown, ok = true) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok,
      json: () => Promise.resolve(config),
    });
  };

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
    mockBannerFetch(mockConfig);

    render(<AlertBanner />);

    await waitFor(() => expect(screen.getByText('Test Alert')).toBeInTheDocument());

    expect(screen.getByText('Test Alert')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('alert-banner--warning');
  });

  it.each([
    ['remains hidden when disabled', { enabled: false, message: 'Hidden', type: 'info', dismissible: true }, true],
    ['remains hidden on fetch failure', new Error('Fetch failed'), false],
    ['handles non-ok response', null, null],
  ])('%s', async (_name, config, ok) => {
    if (config instanceof Error) {
      (global.fetch as jest.Mock).mockRejectedValue(config);
    } else if (config === null) {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    } else {
      mockBannerFetch(config, ok ?? true);
    }

    render(<AlertBanner />);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  test('can be dismissed', async () => {
    const mockConfig = {
      enabled: true,
      message: 'Dismiss me',
      type: 'error',
      dismissible: true,
    };
    mockBannerFetch(mockConfig);

    render(<AlertBanner />);

    await waitFor(() => expect(screen.getByText('Dismiss me')).toBeInTheDocument());

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
    mockBannerFetch(mockConfig);

    render(<AlertBanner />);

    await waitFor(() => expect(screen.getByText('Permanent')).toBeInTheDocument());

    expect(screen.queryByLabelText('Dismiss alert')).not.toBeInTheDocument();
  });
});
