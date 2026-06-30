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

/** Wraps Tab and Shift+Tab so focus stays inside the modal. */
const handleTabNavigation = (event: KeyboardEvent, root: HTMLElement | null): void => {
  if (!root) return;
  const focusable = getFocusableElements(root);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isFirstActive = document.activeElement === first;
  const isLastActive = document.activeElement === last;

  if (event.shiftKey && isFirstActive) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && isLastActive) {
    event.preventDefault();
    first.focus();
  }
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
      const isEscape = event.key === 'Escape';
      const isTab = event.key === 'Tab';
      const canTab = Boolean(modalRef.current && !confirmAction);

      if (isEscape) {
        if (confirmAction) {
          onDismissConfirm();
        } else {
          onClose();
        }
        return;
      }

      if (isTab && canTab) {
        handleTabNavigation(event, modalRef.current);
      }
    },
    [confirmAction, modalRef, onClose, onDismissConfirm],
  );

  useEffect(() => {
    if (!isOpen) return;

    const syncFocus = () => {
      if (!modalRef.current) return;
      const focusable = getFocusableElements(modalRef.current);
      focusable[0]?.focus();
    };

    window.addEventListener('keydown', handleModalKeyDown);
    syncFocus();

    return () => {
      window.removeEventListener('keydown', handleModalKeyDown);
    };
  }, [handleModalKeyDown, isOpen, modalRef]);
};
