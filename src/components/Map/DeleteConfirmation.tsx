import React from 'react';
import { OutlookType } from '../../types/outlooks';
import { stripHtml } from '../../utils/domUtils';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';

interface DeleteConfirmationProps {
  modalState: {
    isOpen: boolean;
    outlookType?: OutlookType;
    probability?: string;
    featureId?: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({ modalState, onConfirm, onCancel }) => {
  const { isOpen, outlookType, probability } = modalState;
  
  if (!isOpen || !outlookType || !probability) return null;

  const outlookName = outlookType.charAt(0).toUpperCase() + outlookType.slice(1);
  const safeProb = stripHtml(probability);

  return (
    <ConfirmationModal
      isOpen={isOpen}
      title={`Delete ${outlookName} Area`}
      message={`Are you sure you want to delete this ${outlookName} outlook area (${safeProb})?`}
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmLabel="Delete"
      cancelLabel="Keep"
    />
  );
};

export default DeleteConfirmation;
