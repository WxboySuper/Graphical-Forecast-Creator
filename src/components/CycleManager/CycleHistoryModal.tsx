import React, { useRef, useState } from 'react';
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
import CycleHistoryModalDialog, { type CycleHistoryConfirmAction } from './CycleHistoryModalDialog';
import { deferCloseAfterConfirm } from './cycleHistoryModalUtils';
import { useCycleHistoryModalKeyboard } from './useCycleHistoryModalKeyboard';

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
  const [confirmAction, setConfirmAction] = useState<CycleHistoryConfirmAction | null>(null);

  useCycleHistoryModalKeyboard({
    isOpen,
    modalRef,
    confirmAction,
    onClose,
    onDismissConfirm: () => setConfirmAction(null),
  });

  if (!isOpen) return null;

  function handleSaveCurrent(): void {
    dispatch(saveCurrentCycle({ label: newLabel.trim() || undefined }));
    setNewLabel('');
    setShowSaveForm(false);
    addToast('Cycle saved successfully!', 'success');
  }

  function handleLoadCycle(cycleId: string): void {
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
  }

  function handleDeleteCycle(cycleId: string): void {
    setConfirmAction({
      title: 'Delete Cycle',
      message: 'Delete this saved cycle permanently?',
      onConfirm: () => {
        dispatch(deleteSavedCycle(cycleId));
        setConfirmAction(null);
      },
    });
  }

  function handleCycleLoadClick(event: React.MouseEvent<HTMLButtonElement>): void {
    const cycleId = event.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleLoadCycle(cycleId);
  }

  function handleCycleDeleteClick(event: React.MouseEvent<HTMLButtonElement>): void {
    const cycleId = event.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleDeleteCycle(cycleId);
  }

  function handleOpenSaveForm(): void {
    setShowSaveForm(true);
  }

  function handleNewLabelChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setNewLabel(event.target.value);
  }

  function handleCancelSaveForm(): void {
    setShowSaveForm(false);
    setNewLabel('');
  }

  function handleCancelConfirm(): void {
    setConfirmAction(null);
  }

  return (
    <ModalPortal>
      <CycleHistoryModalDialog
        modalRef={modalRef}
        currentCycle={currentCycle}
        savedCycles={savedCycles}
        showSaveForm={showSaveForm}
        newLabel={newLabel}
        confirmAction={confirmAction}
        onClose={onClose}
        onOpenSaveForm={handleOpenSaveForm}
        onNewLabelChange={handleNewLabelChange}
        onSaveCurrent={handleSaveCurrent}
        onCancelSaveForm={handleCancelSaveForm}
        onLoadClick={handleCycleLoadClick}
        onDeleteClick={handleCycleDeleteClick}
        onCancelConfirm={handleCancelConfirm}
      />
    </ModalPortal>
  );
};

export default CycleHistoryModal;
