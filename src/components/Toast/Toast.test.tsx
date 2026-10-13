import { render, screen, act } from '@testing-library/react';
import Toast, { normalizeToastType, ToastManager } from './Toast';

const advanceTimersByTime = (milliseconds: number): void => {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
};

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('renders message', () => {
    render(<Toast message="Test Message" onClose={() => undefined} />);
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  test('uses info for an invalid runtime toast type', () => {
    expect(normalizeToastType('eror')).toBe('info');
  });

  test('retains source whitespace in the message text', () => {
    const message = '  - Gusts 40kt\n  - Hail possible  ';
    render(<Toast message={message} onClose={() => undefined} />);
    const toast = screen.getByText((_, element) => element?.classList.contains('toast') ?? false);

    expect(toast.textContent).toBe(message);
  });

  test('calls onClose after 3 seconds', () => {
    const onClose = jest.fn();
    render(<Toast message="Auto Close" onClose={onClose} />);
    
    advanceTimersByTime(3000);

    expect(onClose).toHaveBeenCalled();
  });

  test('restarts the timer when the displayed copy changes', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Original" onClose={onClose} />);

    advanceTimersByTime(2500);
    rerender(<Toast message="Updated" onClose={onClose} />);
    advanceTimersByTime(500);

    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(2500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not restart the timer for whitespace-only changes', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="A B" onClose={onClose} />);

    advanceTimersByTime(2500);
    rerender(<Toast message=" A  B " onClose={onClose} />);
    advanceTimersByTime(500);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('ignores type-only changes and restarts for new copy after a close callback', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Original" type="info" onClose={onClose} />);

    advanceTimersByTime(2500);
    rerender(<Toast message="Original" type="success" onClose={onClose} />);
    advanceTimersByTime(500);

    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Toast message="Updated" type="success" onClose={onClose} />);
    expect(screen.getByText('Updated')).toBeInTheDocument();
    advanceTimersByTime(2999);
    expect(onClose).toHaveBeenCalledTimes(1);
    advanceTimersByTime(1);

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('uses the latest onClose callback without restarting the timer', () => {
    const originalOnClose = jest.fn();
    const updatedOnClose = jest.fn();
    const { rerender } = render(<Toast message="Notice" onClose={originalOnClose} />);

    advanceTimersByTime(2500);
    rerender(<Toast message="Notice" onClose={updatedOnClose} />);
    advanceTimersByTime(500);

    expect(originalOnClose).not.toHaveBeenCalled();
    expect(updatedOnClose).toHaveBeenCalledTimes(1);
  });

  test('caps the lifetime when the message keeps updating', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Update 0" onClose={onClose} />);

    for (let elapsed = 2500; elapsed < 33000; elapsed += 2500) {
      advanceTimersByTime(2500);
      rerender(<Toast message={`Update ${elapsed}`} onClose={onClose} />);
    }

    advanceTimersByTime(2500);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not dismiss the same toast more than once after its lifetime', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="First" onClose={onClose} />);

    advanceTimersByTime(33000);
    rerender(<Toast message="Updated after cap" onClose={onClose} />);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Updated after cap')).not.toBeInTheDocument();
  });

  test('shows a late message update for its minimum reading window within the bounded lifetime', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="First notice" onClose={onClose} />);

    advanceTimersByTime(3000);
    advanceTimersByTime(26000);
    onClose.mockClear();
    rerender(<Toast message="Last second notice" onClose={onClose} />);

    expect(screen.getByText('Last second notice')).toBeInTheDocument();
    advanceTimersByTime(2999);
    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('gives longer messages more time to be read', () => {
    const onClose = jest.fn();
    render(<Toast message={'Notice '.repeat(15)} onClose={onClose} />);

    advanceTimersByTime(3000);
    expect(onClose).not.toHaveBeenCalled();

    advanceTimersByTime(7500);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('uses the rendered words in a multiline message to estimate reading time', () => {
    const onClose = jest.fn();
    const message = ['- North gusts 40 kt', '- South gusts 45 kt', '- East gusts 50 kt'].join('\n');
    render(<Toast message={message} onClose={onClose} />);

    advanceTimersByTime(3000);
    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(2799);
    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(1);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test.each([
    [299, 29900],
    [300, 30000],
    [301, 30000],
    [601, 30000],
  ])('caps a %i-character reading window at %i ms', (characters, duration) => {
    const onClose = jest.fn();
    render(<Toast message={'x'.repeat(characters)} onClose={onClose} />);

    advanceTimersByTime(duration - 1);
    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(1);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not count surrounding whitespace toward the reading window', () => {
    const onClose = jest.fn();
    render(<Toast message={` ${'x'.repeat(59)} `} onClose={onClose} />);

    advanceTimersByTime(3000);
    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(2899);
    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(1);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not count collapsed blank lines as additional reading time', () => {
    const onClose = jest.fn();
    render(<Toast message={`x${'\n\n'.repeat(40)}x`} onClose={onClose} />);

    advanceTimersByTime(3000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('closes empty messages without scheduling a timer', () => {
    const onClose = jest.fn();
    render(<Toast message="   " onClose={onClose} />);

    advanceTimersByTime(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('keeps empty messages from resetting the bounded lifetime', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="First notice" onClose={onClose} />);

    advanceTimersByTime(29000);
    onClose.mockClear();
    rerender(<Toast message="" onClose={onClose} />);
    advanceTimersByTime(0);
    expect(onClose).not.toHaveBeenCalled();
    rerender(<Toast message="New notice" onClose={onClose} />);
    expect(screen.getByText('New notice')).toBeInTheDocument();

    advanceTimersByTime(2999);
    expect(onClose).not.toHaveBeenCalled();
    advanceTimersByTime(1);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clears timeout on unmount', () => {
    const onClose = jest.fn();
    const { unmount } = render(<Toast message="Unmount" onClose={onClose} />);
    unmount();
    
    advanceTimersByTime(3000);

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ToastManager', () => {
  test('renders multiple toasts', () => {
    const toasts = [
      { id: '1', message: 'First', type: 'info' as const },
      { id: '2', message: 'Second', type: 'success' as const },
    ];
    render(<ToastManager toasts={toasts} onDismiss={() => undefined} />);
    
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  test('keeps the live region mounted when the queue is empty', () => {
    render(<ToastManager toasts={[]} onDismiss={() => undefined} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('calls onDismiss when toast closes', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    const toasts = [{ id: '123', message: 'Dismissable' }];
    render(<ToastManager toasts={toasts} onDismiss={onDismiss} />);
    
    advanceTimersByTime(3000);

    expect(onDismiss).toHaveBeenCalledWith('123');
    jest.useRealTimers();
  });

  test('dismisses empty notifications without arming a toast timer', () => {
    const onDismiss = jest.fn();
    const updatedOnDismiss = jest.fn();
    const { rerender } = render(<ToastManager toasts={[{ id: 'empty', message: '  ' }]} onDismiss={onDismiss} />);

    expect(onDismiss).toHaveBeenCalledWith('empty');
    expect(screen.queryByText('  ')).not.toBeInTheDocument();

    rerender(<ToastManager toasts={[{ id: 'empty', message: '  ' }]} onDismiss={updatedOnDismiss} />);
    expect(updatedOnDismiss).not.toHaveBeenCalled();
  });

  test('dismisses messages made only of zero-width formatting characters', () => {
    const onDismiss = jest.fn();
    render(<ToastManager toasts={[{ id: 'case-07', message: '\u200B\uFEFF' }]} onDismiss={onDismiss} />);

    expect(onDismiss).toHaveBeenCalledWith('case-07');
    expect(screen.queryByText(/\u200B/)).not.toBeInTheDocument();
  });

  test('dismisses malformed non-string queue messages without crashing', () => {
    const onDismiss = jest.fn();
    render(<ToastManager toasts={[{ id: 'case-08', message: null as unknown as string }]} onDismiss={onDismiss} />);

    expect(onDismiss).toHaveBeenCalledWith('case-08');
  });
});
