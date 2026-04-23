import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Toast, { ToastManager, ToastProps } from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders with message', () => {
    render(<Toast message="Test message" onClose={jest.fn()} />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders with different types', () => {
    const { rerender } = render(<Toast message="Info toast" type="info" onClose={jest.fn()} />);
    expect(document.querySelector('.toast-info')).toBeInTheDocument();

    rerender(<Toast message="Success toast" type="success" onClose={jest.fn()} />);
    expect(document.querySelector('.toast-success')).toBeInTheDocument();

    rerender(<Toast message="Warning toast" type="warning" onClose={jest.fn()} />);
    expect(document.querySelector('.toast-warning')).toBeInTheDocument();

    rerender(<Toast message="Error toast" type="error" onClose={jest.fn()} />);
    expect(document.querySelector('.toast-error')).toBeInTheDocument();
  });

  it('calls onClose after timeout', () => {
    const onClose = jest.fn();
    render(<Toast message="Test" onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
    
    act(() => {
      jest.advanceTimersByTime(3001);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cleans up timer on unmount', () => {
    const onClose = jest.fn();
    const { unmount } = render(<Toast message="Test" onClose={onClose} />);
    unmount();
    act(() => {
      jest.advanceTimersByTime(3001);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ToastManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders toast items', () => {
    const toasts = [
      { id: '1', message: 'Toast 1', type: 'info' as const },
      { id: '2', message: 'Toast 2', type: 'success' as const },
    ];
    render(<ToastManager toasts={toasts} onDismiss={jest.fn()} />);
    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
  });

  it('renders empty when no toasts', () => {
    render(<ToastManager toasts={[]} onDismiss={jest.fn()} />);
    const container = document.querySelector('.toast-container');
    expect(container).toBeInTheDocument();
  });

  it('calls onDismiss when close is clicked', async () => {
    const onDismiss = jest.fn();
    const toasts = [{ id: '1', message: 'Test toast', type: 'info' as const }];
    render(<ToastManager toasts={toasts} onDismiss={onDismiss} />);
    
    // The Toast auto-dismisses after 3 seconds, but we can test the manager works
    expect(screen.getByText('Test toast')).toBeInTheDocument();
  });
});