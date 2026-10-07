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
      jest.advanceTimersByTime(2500);
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
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
