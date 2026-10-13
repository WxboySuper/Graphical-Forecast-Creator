import { render, screen, act } from '@testing-library/react';
import Toast, { ToastManager } from './Toast';

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

  test('calls onClose after 3 seconds', () => {
    const onClose = jest.fn();
    render(<Toast message="Auto Close" onClose={onClose} />);
    
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(onClose).toHaveBeenCalled();
  });

  test('restarts the auto-dismiss timer when the message updates', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Original" onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    rerender(<Toast message="Updated" onClose={onClose} />);
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('ignores type-only changes and restarts for new copy after a close callback', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Original" type="info" onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    rerender(<Toast message="Original" type="success" onClose={onClose} />);
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Toast message="Updated" type="success" onClose={onClose} />);
    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('uses the latest onClose callback without restarting the timer', () => {
    const originalOnClose = jest.fn();
    const updatedOnClose = jest.fn();
    const { rerender } = render(<Toast message="Notice" onClose={originalOnClose} />);

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    rerender(<Toast message="Notice" onClose={updatedOnClose} />);
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(originalOnClose).not.toHaveBeenCalled();
    expect(updatedOnClose).toHaveBeenCalledTimes(1);
  });

  test('caps the lifetime when the message keeps updating', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="Update 0" onClose={onClose} />);

    for (let elapsed = 2500; elapsed < 30000; elapsed += 2500) {
      act(() => {
        jest.advanceTimersByTime(2500);
      });
      rerender(<Toast message={`Update ${elapsed}`} onClose={onClose} />);
    }

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not dismiss the same toast more than once after its lifetime', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="First" onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(30000);
    });
    rerender(<Toast message="Updated after cap" onClose={onClose} />);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('gives longer messages more time to be read', () => {
    const onClose = jest.fn();
    render(<Toast message={'Notice '.repeat(15)} onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(7500);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not count surrounding whitespace toward the reading window', () => {
    const onClose = jest.fn();
    render(<Toast message={` ${'x'.repeat(59)} `} onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(2899);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('hides empty or malformed messages and closes them immediately', () => {
    const onClose = jest.fn();
    const { rerender } = render(<Toast message="   " onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Toast message={null} onClose={onClose} />);
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('clears timeout on unmount', () => {
    const onClose = jest.fn();
    const { unmount } = render(<Toast message="Unmount" onClose={onClose} />);
    unmount();
    
    act(() => {
      jest.advanceTimersByTime(3000);
    });

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
    
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(onDismiss).toHaveBeenCalledWith('123');
    jest.useRealTimers();
  });
});
