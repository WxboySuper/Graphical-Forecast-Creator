import { memo, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import './Toast.css';

const MIN_TOAST_DURATION_MS = 3000;
const MAX_TOAST_LIFETIME_MS = 30000;
const MS_PER_CHARACTER = 100;
const MAX_READING_CHARACTERS = MAX_TOAST_LIFETIME_MS / MS_PER_CHARACTER;

/** Estimates a reading window from trimmed copy, bounded by the toast lifetime. */
const getToastDuration = (timingMessage: string): number => {
  // Code points approximate reading length; the minimum and maximum bound the estimate.
  // Stop at the cap so even very long messages need only a bounded scan.
  let characterCount = 0;
  for (const _character of timingMessage) {
    characterCount += 1;
    if (characterCount >= MAX_READING_CHARACTERS) break;
  }
  return Math.min(
    MAX_TOAST_LIFETIME_MS,
    Math.max(MIN_TOAST_DURATION_MS, characterCount * MS_PER_CHARACTER),
  );
};

/** Calculates how much time remains before the absolute lifetime cap. */
const getRemainingLifetime = (
  mountedAt: number,
  now: number,
): number => {
  return Math.max(0, MAX_TOAST_LIFETIME_MS - (now - mountedAt));
};

/** Closes a toast at most once, even when its timer is replaced after the cap. */
const closeToastOnce = (
  closedRef: RefObject<boolean>,
  onCloseRef: RefObject<() => void>,
  markClosed: () => void,
): void => {
  if (closedRef.current) return;
  closedRef.current = true;
  markClosed();
  onCloseRef.current();
};

type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastData {
  id: string;
  message: string | null | undefined;
  type?: ToastType;
}

export interface ToastProps {
  message: string | null | undefined;
  type?: ToastType;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  const onCloseRef = useRef(onClose);
  const mountedAtRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const [isClosed, setIsClosed] = useState(false);
  const displayMessage = message ?? '';
  const normalizedMessage = displayMessage.trim();
  const timingMessage = normalizedMessage.replace(/\s+/g, ' ');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Message changes restart the reading window without extending the maximum lifetime.
    if (!timingMessage) return;
    const now = performance.now();
    mountedAtRef.current ??= now;
    const remainingLifetime = getRemainingLifetime(mountedAtRef.current, now);
    if (remainingLifetime <= 0) {
      closeToastOnce(closedRef, onCloseRef, () => setIsClosed(true));
      return;
    }
    closedRef.current = false;
    setIsClosed(false);
    const readingWindow = getToastDuration(timingMessage);
    // The lifetime cap intentionally wins over a full last reading window.
    const duration = Math.min(readingWindow, remainingLifetime);
    const timer = setTimeout(() => {
      closeToastOnce(closedRef, onCloseRef, () => setIsClosed(true));
    }, duration);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return () => {
      clearTimeout(timer);
    };
  }, [timingMessage]);

  return normalizedMessage && !isClosed ? (
    <div className={`toast toast-${type}`}>
      {displayMessage}
    </div>
  ) : null;
};

export interface ToastManagerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

// Small wrapper to avoid inline arrow functions in parent JSX
const ToastItem = memo(function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const emptyMessage = !(toast.message?.trim() ?? '');
  const emptyDismissedRef = useRef(false);
  const handleClose = useCallback(() => {
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (!emptyMessage) {
      emptyDismissedRef.current = false;
      return;
    }
    if (emptyDismissedRef.current) return;
    emptyDismissedRef.current = true;
    onDismiss(toast.id);
  }, [emptyMessage, onDismiss, toast.id]);

  if (emptyMessage) return null;

  return <Toast message={toast.message} type={toast.type} onClose={handleClose} />;
});

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
