/**
 * Toast primitives. Renders timed feedback messages and manages the add, update,
 * dismissal, and automatic-expiry behavior of the shared toast collection.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { trackEvent } from '../../lib/telemetry';
import './Toast.css';

const MIN_TOAST_DURATION_MS = 3000;
const MS_PER_CHARACTER = 100;
const MAX_TOAST_LIFETIME_MS = 30000;
// A final update at the 30-second cap still gets the minimum reading window.
const MAX_TOAST_TOTAL_LIFETIME_MS = MAX_TOAST_LIFETIME_MS + MIN_TOAST_DURATION_MS;
const MAX_READING_CHARACTERS = Math.floor(MAX_TOAST_LIFETIME_MS / MS_PER_CHARACTER);
export type ToastType = 'info' | 'success' | 'warning' | 'error';

/** Uses a safe display type when runtime data falls outside the toast API. */
export const normalizeToastType = (type: unknown): ToastType =>
  type === 'success' || type === 'warning' || type === 'error' ? type : 'info';

/** Returns whether a toast message contains no visible text. */
export const isEmptyToastMessage = (message: unknown): boolean =>
  typeof message !== 'string' || message.replace(/[\u200B-\u200D\uFEFF]/gu, '').trim().length === 0;

/** Uses the same clock source for the toast lifetime and timer deadlines. */
const getCurrentTime = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

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

/**
 * Keeps a toast open while keyboard focus is inside it, and remembers where focus came from
 * so dismissing the toast can send it back.
 */
const useToastFocusHold = () => {
  const [hasFocus, setHasFocus] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Cleared only when focus moves to another element; a blur with no target can mean the toast is being removed.
  const holdsFocusRef = useRef(false);

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    holdsFocusRef.current = true;
    if (event.currentTarget.contains(event.relatedTarget)) return;
    returnFocusRef.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    setHasFocus(true);
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    if (event.relatedTarget) holdsFocusRef.current = false;
    setHasFocus(false);
  };
  const restoreFocus = useCallback(() => {
    const returnTo = returnFocusRef.current;
    if (returnTo?.isConnected) returnTo.focus();
  }, []);
  /** Hands focus back and forgets the hold; a hidden toast gets no blur event to clear it. */
  const releaseFocus = useCallback(() => {
    holdsFocusRef.current = false;
    setHasFocus(false);
    restoreFocus();
  }, [restoreFocus]);

  // The queue can drop a toast (e.g. the oldest when a fifth arrives) while its dismiss button has focus.
  useEffect(() => () => {
    const focusLost = !document.activeElement || document.activeElement === document.body;
    if (holdsFocusRef.current && focusLost) restoreFocus();
  }, [restoreFocus]);

  return { hasFocus, focusHandlers: { onFocus, onBlur }, restoreFocus, releaseFocus };
};

interface ToastExpiryOptions {
  emptyMessage: boolean;
  timingMessage: string;
  /** While true (focus is inside the toast) no expiry timer runs. */
  paused: boolean;
  mountedAtRef: { current: number | null };
  closedRef: { current: boolean };
  onCloseRef: { current: () => void };
  setIsClosed: (closed: boolean) => void;
}

/** Closes the toast after its reading window, capped by its maximum lifetime. */
const useToastExpiry = ({
  emptyMessage,
  timingMessage,
  paused,
  mountedAtRef,
  closedRef,
  onCloseRef,
  setIsClosed,
}: ToastExpiryOptions): void => {
  useEffect(() => {
    const close = () => closeToastOnce(closedRef, onCloseRef, () => setIsClosed(true));
    // Message changes restart the reading window without extending the maximum lifetime.
    if (emptyMessage) {
      close();
      return;
    }
    if (paused) return;
    const now = getCurrentTime();
    mountedAtRef.current ??= now;
    const remainingLifetime = getRemainingLifetime(mountedAtRef.current, now);
    if (remainingLifetime === 0) {
      close();
      return;
    }
    // A changed message starts a new reading window and may close once for that version.
    closedRef.current = false;
    setIsClosed(false);
    const duration = Math.min(getToastDuration(timingMessage), remainingLifetime);
    const timer = setTimeout(close, duration);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return () => {
      clearTimeout(timer);
    };
  }, [emptyMessage, timingMessage, paused, mountedAtRef, closedRef, onCloseRef, setIsClosed]);
};

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const mountedAtRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const [isClosed, setIsClosed] = useState(false);
  const displayMessage = typeof message === 'string' ? message : '';
  const emptyMessage = isEmptyToastMessage(displayMessage);
  const timingMessage = displayMessage.trim().replace(/\s+/gu, ' ');
  const displayType = normalizeToastType(type);

  const { hasFocus, focusHandlers, restoreFocus, releaseFocus } = useToastFocusHold();
  useToastExpiry({ emptyMessage, timingMessage, paused: hasFocus, mountedAtRef, closedRef, onCloseRef, setIsClosed });
  // A focused toast whose copy is cleared disappears; send focus back instead of dropping it on <body>.
  useEffect(() => {
    if (emptyMessage && hasFocus) releaseFocus();
  }, [emptyMessage, hasFocus, releaseFocus]);
  const messageId = useId();
  const dismissId = useId();

  const handleDismiss = () => {
    closeToastOnce(closedRef, onCloseRef, () => setIsClosed(true));
    restoreFocus();
  };

  return !emptyMessage && !isClosed ? (
    <div className={`toast toast-${displayType}`} {...focusHandlers}>
      <span id={messageId} className="toast-message">{displayMessage}</span>
      {/* Named "Dismiss notification <message>" so several open toasts' buttons can be told apart. */}
      <button
        type="button"
        id={dismissId}
        className="toast-dismiss"
        aria-label="Dismiss notification"
        aria-labelledby={`${dismissId} ${messageId}`}
        onClick={handleDismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  ) : null;
};

export interface ToastManagerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

/** Filters and renders one queued toast, dismissing invalid empty copy. */
function ToastEntry({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }): React.ReactElement | null {
  useEffect(() => {
    if (normalizeToastType(toast.type) === 'error') trackEvent('error_shown', 'error');
  }, [toast.id, toast.type]);
  const emptyMessage = isEmptyToastMessage(toast.message);
  const emptyDismissedRef = useRef(false);
  const handleClose = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);
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
}

/**
 * Keeps both live regions mounted and renders the current toast queue. Errors go to the
 * assertive region so they interrupt; everything else is announced politely.
 */
export function ToastManager({ toasts, onDismiss }: ToastManagerProps): React.ReactElement {
  const isError = (toast: ToastData) => normalizeToastType(toast.type) === 'error';
  return (
    <div className="toast-container">
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.filter((toast) => !isError(toast)).map((toast) => (
          <ToastEntry key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
      {/* No role="alert": an always-mounted, usually empty alert would read as a standing alert. */}
      <div className="toast-region" aria-live="assertive" data-testid="toast-error-region">
        {toasts.filter(isError).map((toast) => (
          <ToastEntry key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

export default Toast;
