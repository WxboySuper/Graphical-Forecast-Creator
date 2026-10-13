import { useEffect, useRef, useState } from 'react';
import './Toast.css';

const MIN_TOAST_DURATION_MS = 3000;
const MS_PER_CHARACTER = 100;
const MAX_TOAST_LIFETIME_MS = 30000;
// A final update at the 30-second cap still gets the minimum reading window.
const MAX_TOAST_TOTAL_LIFETIME_MS = MAX_TOAST_LIFETIME_MS + MIN_TOAST_DURATION_MS;
const MAX_READING_CHARACTERS = Math.floor(MAX_TOAST_LIFETIME_MS / MS_PER_CHARACTER);
export type ToastType = 'info' | 'success' | 'warning' | 'error';

/** Returns whether a toast message contains no visible text. */
const isEmptyToastMessage = (message: string): boolean =>
  message.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length === 0;

/** Uses the same clock source for the toast lifetime and timer deadlines. */
const getCurrentTime = (): number => performance.now();

/** Estimates a reading window from trimmed copy, bounded by the toast lifetime. */
const getToastDuration = (timingMessage: string): number => {
  // Length is capped before multiplication so very long messages cannot exceed the lifetime.
  const characterCount = Math.min(MAX_READING_CHARACTERS, timingMessage.length);
  return Math.min(
    MAX_TOAST_LIFETIME_MS,
    Math.max(MIN_TOAST_DURATION_MS, characterCount * MS_PER_CHARACTER),
  );
};

/** Calculates how much time remains before the hard total lifetime cap. */
const getRemainingLifetime = (mountedAt: number, now: number): number =>
  Math.max(0, MAX_TOAST_TOTAL_LIFETIME_MS - (now - mountedAt));

/** Closes once for the active reading window, even if its timer is replaced. */
const closeToastOnce = (
  closedRef: { current: boolean },
  onCloseRef: { current: () => void },
  markClosed: () => void,
): void => {
  if (closedRef.current) return;
  closedRef.current = true;
  markClosed();
  onCloseRef.current();
};

export interface ToastData {
  id: string;
  message: string;
  type?: ToastType;
}

export interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
}

const TOAST_TYPES: readonly ToastType[] = ['info', 'success', 'warning', 'error'];

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const mountedAtRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const [isClosed, setIsClosed] = useState(false);
  const displayMessage = typeof message === 'string' ? message : '';
  const safeType: ToastType = (TOAST_TYPES as readonly (ToastType | undefined)[]).includes(type)
    ? type as ToastType
    : 'info';

  useEffect(() => {
    // Message changes restart the reading window without extending the maximum lifetime.
    if (isEmptyToastMessage(displayMessage)) {
      closeToastOnce(closedRef, onCloseRef, () => setIsClosed(true));
      return;
    }
    const now = getCurrentTime();
    mountedAtRef.current ??= now;
    const remainingLifetime = getRemainingLifetime(mountedAtRef.current, now);
    if (remainingLifetime === 0) {
      closeToastOnce(closedRef, onCloseRef, () => setIsClosed(true));
      return;
    }
    // A changed message starts a new reading window and may close once for that version.
    closedRef.current = false;
    setIsClosed(false);
    const timingMessage = displayMessage.trim().replace(/\s+/g, ' ');
    const readingWindow = getToastDuration(timingMessage);
    const duration = Math.min(readingWindow, remainingLifetime);
    const timer = setTimeout(() => {
      closeToastOnce(closedRef, onCloseRef, () => setIsClosed(true));
    }, duration);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return () => {
      clearTimeout(timer);
    };
  }, [displayMessage]);

  return !isEmptyToastMessage(displayMessage) && !isClosed ? (
    <div className={`toast toast-${safeType}`}>
      {displayMessage}
    </div>
  ) : null;
};

export interface ToastManagerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

/** Filters and renders one queued toast, dismissing invalid empty copy. */
function ToastEntry({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }): React.ReactElement | null {
  const emptyMessage = isEmptyToastMessage(toast.message);
  const emptyDismissedRef = useRef(false);
  useEffect(() => {
    if (!emptyMessage) {
      emptyDismissedRef.current = false;
      return;
    }
    if (emptyDismissedRef.current) return;
    emptyDismissedRef.current = true;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Dismissed empty toast message with id ${toast.id}`);
    }
    onDismiss(toast.id);
  }, [emptyMessage, onDismiss, toast.id]);

  if (emptyMessage) return null;

  return <Toast message={toast.message} type={toast.type} onClose={() => onDismiss(toast.id)} />;
}

/** Keeps the polite status region mounted and renders the current toast queue. */
export function ToastManager({ toasts, onDismiss }: ToastManagerProps): React.ReactElement {
  return (
    <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <ToastEntry key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export default Toast;
