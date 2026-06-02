import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AlertBanner from './AlertBanner';

const renderBanner = () =>
  render(
    <MemoryRouter>
      <AlertBanner />
    </MemoryRouter>,
  );

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

    renderBanner();

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

    renderBanner();

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

    renderBanner();

    await waitFor(() => expect(screen.getByText('Dismiss me')).toBeInTheDocument());

    const closeButton = screen.getByLabelText('Dismiss alert');
    fireEvent.click(closeButton);

    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  test('does not render unsafe javascript banner links', async () => {
    mockBannerFetch({
      enabled: true,
      message: 'Click me',
      type: 'info',
      dismissible: true,
      linkUrl: 'javascript:alert(1)',
      linkLabel: 'Bad link',
    });

    renderBanner();

    await waitFor(() => expect(screen.getByText('Click me')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Bad link' })).not.toBeInTheDocument();
  });

  test('is not dismissible when dismissible is false', async () => {
    const mockConfig = {
      enabled: true,
      message: 'Permanent',
      type: 'info',
      dismissible: false,
    };
    mockBannerFetch(mockConfig);

    renderBanner();

    await waitFor(() => expect(screen.getByText('Permanent')).toBeInTheDocument());

    expect(screen.queryByLabelText('Dismiss alert')).not.toBeInTheDocument();
  });
});
