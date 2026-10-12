import { useCallback, useEffect, useRef, useState } from 'react';
import './Toast.css';

const TOAST_DURATION_MS = 3000;
const MAX_TOAST_LIFETIME_MS = 30000;

export interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  const onCloseRef = useRef(onClose);
  const startedAtRef = useRef(0);
  const remainingDurationRef = useRef(TOAST_DURATION_MS);
  const remainingLifetimeRef = useRef(MAX_TOAST_LIFETIME_MS);
  const previousMessageRef = useRef(message);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Message updates restart the reading window, but never extend a toast past its maximum lifetime.
    if (previousMessageRef.current !== message) {
      previousMessageRef.current = message;
      remainingDurationRef.current = TOAST_DURATION_MS;
    }
    if (isPaused) return undefined;

    const duration = Math.min(remainingDurationRef.current, remainingLifetimeRef.current);
    startedAtRef.current = Date.now();
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, duration);

    return () => {
      clearTimeout(timer);
      const elapsed = Date.now() - startedAtRef.current;
      remainingDurationRef.current = Math.max(0, remainingDurationRef.current - elapsed);
      remainingLifetimeRef.current = Math.max(0, remainingLifetimeRef.current - elapsed);
    };
  }, [message, isPaused]);

  const handleMouseEnter = () => {
    hoveredRef.current = true;
    setIsPaused(true);
  };
  const handleMouseLeave = () => {
    hoveredRef.current = false;
    setIsPaused(focusedRef.current);
  };
  const handleFocus = () => {
    focusedRef.current = true;
    setIsPaused(true);
  };
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      focusedRef.current = false;
      setIsPaused(hoveredRef.current);
    }
  };

  return (
    <div
      className={`toast toast-${type}`}
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <span key={message} className="toast-message">{message}</span>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss notification"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
};

export interface ToastManagerProps {
  toasts: Array<{ id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }>;
  onDismiss: (id: string) => void;
}

// Small wrapper to avoid inline arrow functions in parent JSX
const ToastItem: React.FC<{ toast: { id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const handleClose = useCallback(() => {
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  return <Toast message={toast.message} type={toast.type} onClose={handleClose} />;
};

export const ToastManager: React.FC<ToastManagerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="toast-container" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default Toast;
