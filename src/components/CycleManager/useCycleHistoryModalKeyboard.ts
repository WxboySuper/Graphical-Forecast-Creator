/**
 * Keyboard behavior hook for the cycle-history modal. It handles escape and
 * navigation keys while leaving modal rendering and history state to callers.
 */
import React, { useCallback, useEffect } from 'react';

/** Returns focusable controls inside the modal dialog root. */
const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
};

/**
 * Returns the control Tab should wrap to, or null to let the browser move focus.
 * Focus outside the modal (e.g. on <body> after a deleted row's button unmounts) always wraps back in.
 */
const getWrapTarget = (focusable: HTMLElement[], root: HTMLElement, backwards: boolean): HTMLElement | null => {
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const edge = backwards ? first : last;
  const active = document.activeElement;
  if (active !== edge && root.contains(active)) return null;
  return backwards ? last : first;
};

/** Wraps Tab and Shift+Tab so focus stays inside the modal. */
const handleTabNavigation = (event: KeyboardEvent, root: HTMLElement | null): void => {
  if (!root) return;
  const focusable = getFocusableElements(root);
  if (focusable.length === 0) return;

  const target = getWrapTarget(focusable, root, event.shiftKey);
  if (!target) return;
  event.preventDefault();
  target.focus();
};

/** Handles Escape for the history modal or its nested confirm dialog. */
const handleEscapeKey = (
  event: KeyboardEvent,
  confirmAction: unknown,
  onDismissConfirm: () => void,
  onClose: () => void,
): boolean => {
  if (event.key !== 'Escape') {
    return false;
  }

  if (confirmAction) {
    onDismissConfirm();
  } else {
    onClose();
  }

  return true;
};

/** Traps Tab navigation while the history modal is active and no confirm is open. */
const handleModalTabKey = (
  event: KeyboardEvent,
  modalRef: React.RefObject<HTMLDivElement | null>,
  confirmAction: unknown,
): void => {
  if (event.key !== 'Tab') {
    return;
  }

  if (confirmAction) {
    return;
  }

  const root = modalRef.current;
  if (!root) {
    return;
  }

  handleTabNavigation(event, root);
};

interface UseCycleHistoryModalKeyboardOptions {
  isOpen: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  confirmAction: unknown;
  onClose: () => void;
  onDismissConfirm: () => void;
}

/** Installs Escape/Tab keyboard handling and initial focus while the modal is open. */
export const useCycleHistoryModalKeyboard = ({
  isOpen,
  modalRef,
  confirmAction,
  onClose,
  onDismissConfirm,
}: UseCycleHistoryModalKeyboardOptions): void => {
  const handleModalKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (handleEscapeKey(event, confirmAction, onDismissConfirm, onClose)) {
        return;
      }

      handleModalTabKey(event, modalRef, confirmAction);
    },
    [confirmAction, modalRef, onClose, onDismissConfirm],
  );

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('keydown', handleModalKeyDown);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return () => {
      window.removeEventListener('keydown', handleModalKeyDown);
    };
  }, [handleModalKeyDown, isOpen]);

  // Runs only on open and close, so opening or closing the stacked confirm leaves focus where Radix puts it.
  useEffect(() => {
    if (!isOpen) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    getFocusableElements(modalRef.current)[0]?.focus();

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, modalRef]);
};
