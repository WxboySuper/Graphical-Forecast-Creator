import { render, screen, act } from '@testing-library/react';
import Toast, { ToastManager } from './Toast';

const advanceTimersByTime = (milliseconds: number): void => {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
};

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders message', () => {
    render(<Toast message="Test Message" onClose={() => undefined} />);
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  test('preserves message whitespace in the rendered copy', () => {
    const message = '  - Gusts 40kt\n  - Hail possible  ';
    render(<Toast message={message} onClose={() => undefined} />);
    const toast = screen.getByText((_, element) => element?.classList.contains('toast') ?? false);

    expect(toast.textContent).toBe(message.trim());
  });

  test('calls onClose after 3 seconds', () => {
    const onClose = jest.fn();
    render(<Toast message="Auto Close" onClose={onClose} />);
    
    advanceTimersByTime(3000);

    expect(onClose).toHaveBeenCalled();
  });

  test('restarts the auto-dismiss timer when the message updates', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Original" onClose={onClose} />);

    advanceTimersByTime(2500);
    rerender(<Toast message="Updated" onClose={onClose} />);
    advanceTimersByTime(500);

    expect(onClose).not.toHaveBeenCalled();

    advanceTimersByTime(2500);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not restart the timer for whitespace-only message changes', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Notice" onClose={onClose} />);

    advanceTimersByTime(2500);
    rerender(<Toast message="  Notice  " onClose={onClose} />);
    advanceTimersByTime(500);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not restart the timer when internal spacing changes', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="A  B" onClose={onClose} />);

    advanceTimersByTime(2500);
    rerender(<Toast message="A B" onClose={onClose} />);
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

    for (let elapsed = 2500; elapsed < 30000; elapsed += 2500) {
      advanceTimersByTime(2500);
      rerender(<Toast message={`Update ${elapsed}`} onClose={onClose} />);
    }

    advanceTimersByTime(2500);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not dismiss the same toast more than once after its lifetime', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="First" onClose={onClose} />);

    advanceTimersByTime(30000);
    rerender(<Toast message="Updated after cap" onClose={onClose} />);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Updated after cap')).not.toBeInTheDocument();
  });

  test('gives longer messages more time to be read', () => {
    const onClose = jest.fn();
    render(<Toast message={'Notice '.repeat(15)} onClose={onClose} />);

    advanceTimersByTime(3000);
    expect(onClose).not.toHaveBeenCalled();

    advanceTimersByTime(7500);

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

  test('closes empty or malformed messages without scheduling a timer', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="   " onClose={onClose} />);

    advanceTimersByTime(0);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Toast message={null} onClose={onClose} />);
    advanceTimersByTime(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('keeps the lifetime cap when a reused toast gets new copy after empty state', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="First notice" onClose={onClose} />);

    advanceTimersByTime(29000);
    onClose.mockClear();
    rerender(<Toast message="" onClose={onClose} />);
    advanceTimersByTime(0);
    expect(onClose).not.toHaveBeenCalled();
    rerender(<Toast message="New notice" onClose={onClose} />);

    advanceTimersByTime(999);
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
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'false');
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
});
