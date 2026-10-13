import { useCallback, useEffect, useRef } from 'react';
import './Toast.css';

const MIN_TOAST_DURATION_MS = 3000;
const MAX_TOAST_LIFETIME_MS = 30000;

const getToastDuration = (message: string) =>
  Math.min(MAX_TOAST_LIFETIME_MS, Math.max(MIN_TOAST_DURATION_MS, message.length * 50));

export interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  const onCloseRef = useRef(onClose);
  const mountedAtRef = useRef(performance.now());

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    // Message changes restart the reading window without extending the maximum lifetime.
    const elapsed = performance.now() - mountedAtRef.current;
    const remainingLifetime = Math.max(0, MAX_TOAST_LIFETIME_MS - elapsed);
    const duration = Math.min(getToastDuration(message), remainingLifetime);
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, duration);

    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className={`toast toast-${type}`}>{message}</div>
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
    <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default Toast;
