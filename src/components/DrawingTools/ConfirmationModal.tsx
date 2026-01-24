import React from 'react';
import './ExportModal.css'; // Reuse modal styles

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel"
}) => {
  if (!isOpen) return null;

  return (
    <div className="export-modal-overlay">
      <div className="export-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-desc">{message}</p>
        <div className="export-modal-actions">
          <button
            type="button"
            className="export-modal-btn export-modal-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="export-modal-btn export-modal-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;