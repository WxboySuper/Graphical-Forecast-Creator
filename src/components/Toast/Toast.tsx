import { useCallback, useEffect, useRef } from 'react';
import './Toast.css';

const MIN_TOAST_DURATION_MS = 3000;
const MAX_TOAST_LIFETIME_MS = 30000;
const MS_PER_CHARACTER = 100;
const MAX_READING_CHARACTERS = MAX_TOAST_LIFETIME_MS / MS_PER_CHARACTER;

/** Estimates a reading window from trimmed copy, bounded by the toast lifetime. */
const getToastDuration = (trimmedMessage: string): number => {
  if (!trimmedMessage) return 0;

  // No code point uses more than two UTF-16 code units, so this detects the cap
  // without allocating an array for very long messages.
  const characterCount = trimmedMessage.length >= MAX_READING_CHARACTERS * 2
    ? MAX_READING_CHARACTERS
    : Array.from(trimmedMessage).length;
  return Math.min(
    MAX_TOAST_LIFETIME_MS,
    Math.max(MIN_TOAST_DURATION_MS, characterCount * MS_PER_CHARACTER),
  );
};

export interface ToastProps {
  message: string | null | undefined;
  type?: 'info' | 'success' | 'warning' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  const onCloseRef = useRef(onClose);
  const mountedAtRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const normalizedMessage = message?.trim() ?? '';

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Message changes restart the reading window without extending the maximum lifetime.
    const now = performance.now();
    if (mountedAtRef.current === null) mountedAtRef.current = now;
    const elapsed = now - mountedAtRef.current;
    const remainingLifetime = Math.max(0, MAX_TOAST_LIFETIME_MS - elapsed);
    if (remainingLifetime > 0) closedRef.current = false;
    const readingWindow = message == null ? 0 : getToastDuration(normalizedMessage);
    // The lifetime cap intentionally wins over a full last reading window.
    const duration = Math.min(readingWindow, remainingLifetime);
    const timer = setTimeout(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onCloseRef.current();
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [message, normalizedMessage]);

  return normalizedMessage ? (
    <div
      className={`toast toast-${type}`}
      tabIndex={normalizedMessage.length > MAX_READING_CHARACTERS ? 0 : undefined}
    >
      {message}
    </div>
  ) : null;
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
    <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default Toast;
