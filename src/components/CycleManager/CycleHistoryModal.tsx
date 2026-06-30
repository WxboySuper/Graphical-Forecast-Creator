import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectSavedCycles,
  selectForecastCycle,
  saveCurrentCycle,
  loadSavedCycle,
  deleteSavedCycle,
} from '../../store/forecastSlice';
import { useAppLayout } from '../Layout/AppLayout';
import ModalPortal from '../ui/ModalPortal';
import './CycleHistoryModal.css';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';
import CycleHistoryModalDialog from './CycleHistoryModalDialog';
import { deferCloseAfterConfirm } from './cycleHistoryModalUtils';

interface CycleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export { deferCloseAfterConfirm } from './cycleHistoryModalUtils';

/** Modal for browsing, saving, loading, and deleting saved forecast cycles. */
const CycleHistoryModal: React.FC<CycleHistoryModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { addToast } = useAppLayout();
  const savedCycles = useSelector(selectSavedCycles);
  const currentCycle = useSelector(selectForecastCycle);

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => {
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
  };

  const handleTabNavigation = React.useCallback((event: KeyboardEvent, root: HTMLElement | null) => {
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
  }, []);

  const handleModalKeyDown = React.useCallback(
    (event: KeyboardEvent) => {
      const isEscape = event.key === 'Escape';
      const isTab = event.key === 'Tab';
      const canTab = Boolean(modalRef.current && !confirmAction);

      if (isEscape) {
        if (confirmAction) {
          setConfirmAction(null);
        } else {
          onClose();
        }
        return;
      }

      if (isTab && canTab) {
        handleTabNavigation(event, modalRef.current);
      }
    },
    [onClose, confirmAction, handleTabNavigation],
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
  }, [isOpen, handleModalKeyDown]);

  if (!isOpen) return null;

  const handleSaveCurrent = () => {
    dispatch(saveCurrentCycle({ label: newLabel.trim() || undefined }));
    setNewLabel('');
    setShowSaveForm(false);
    addToast('Cycle saved successfully!', 'success');
  };

  const handleLoadCycle = (cycleId: string) => {
    setConfirmAction({
      title: 'Load Cycle',
      message: 'Load this cycle? Unsaved changes to your current cycle will be lost.',
      onConfirm: () => {
        dispatch(loadSavedCycle(cycleId));
        addToast('Cycle loaded!', 'success');
        setConfirmAction(null);
        deferCloseAfterConfirm(onClose);
      },
    });
  };

  const handleDeleteCycle = (cycleId: string) => {
    setConfirmAction({
      title: 'Delete Cycle',
      message: 'Delete this saved cycle permanently?',
      onConfirm: () => {
        dispatch(deleteSavedCycle(cycleId));
        setConfirmAction(null);
      },
    });
  };

  const handleCycleLoadClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const cycleId = event.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleLoadCycle(cycleId);
  };

  const handleCycleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const cycleId = event.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleDeleteCycle(cycleId);
  };

  return (
    <ModalPortal>
      <CycleHistoryModalDialog
        modalRef={modalRef}
        currentCycle={currentCycle}
        savedCycles={savedCycles}
        showSaveForm={showSaveForm}
        newLabel={newLabel}
        onClose={onClose}
        onOpenSaveForm={() => setShowSaveForm(true)}
        onNewLabelChange={(event) => setNewLabel(event.target.value)}
        onSaveCurrent={handleSaveCurrent}
        onCancelSaveForm={() => {
          setShowSaveForm(false);
          setNewLabel('');
        }}
        onLoadClick={handleCycleLoadClick}
        onDeleteClick={handleCycleDeleteClick}
      />
      {confirmAction && (
        <ConfirmationModal
          isOpen={true}
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          overlayClassName="export-modal-overlay--stacked"
        />
      )}
    </ModalPortal>
  );
};

export default CycleHistoryModal;
