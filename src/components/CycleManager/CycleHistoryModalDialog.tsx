import React from 'react';
import type { SavedCycle } from '../../store/forecastSlice';
import type { ForecastCycle } from '../../types/outlooks';
import CycleHistorySavedList from './CycleHistorySavedList';

interface CycleHistoryCurrentSectionProps {
  currentCycle: ForecastCycle;
  showSaveForm: boolean;
  newLabel: string;
  onOpenSaveForm: () => void;
  onNewLabelChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveCurrent: () => void;
  onCancelSaveForm: () => void;
}

/** Renders the current-cycle summary and save form. */
const CycleHistoryCurrentSection: React.FC<CycleHistoryCurrentSectionProps> = ({
  currentCycle,
  showSaveForm,
  newLabel,
  onOpenSaveForm,
  onNewLabelChange,
  onSaveCurrent,
  onCancelSaveForm,
}) => (
  <div className="history-current-section">
    <h3>Current Cycle</h3>
    <div className="history-current-info">
      <strong>Date:</strong> {new Date(currentCycle.cycleDate).toLocaleDateString()}
      <br />
      <strong>Active Day:</strong> Day {currentCycle.currentDay}
      <br />
      <strong>Days with data:</strong> {Object.keys(currentCycle.days).length}
    </div>

    {!showSaveForm ? (
      <button className="history-btn-save-current" onClick={onOpenSaveForm}>
        💾 Save Current Cycle
      </button>
    ) : (
      <div className="history-save-form">
        <input
          type="text"
          placeholder="Optional label (e.g., Morning, Afternoon, 00Z)"
          value={newLabel}
          onChange={onNewLabelChange}
          className="history-label-input"
          maxLength={50}
        />
        <div className="history-save-form-buttons">
          <button className="history-btn-save-confirm" onClick={onSaveCurrent}>
            Save
          </button>
          <button className="history-btn-save-cancel" onClick={onCancelSaveForm}>
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
);

interface CycleHistoryModalDialogProps {
  modalRef: React.RefObject<HTMLDivElement | null>;
  currentCycle: ForecastCycle;
  savedCycles: SavedCycle[];
  showSaveForm: boolean;
  newLabel: string;
  onClose: () => void;
  onOpenSaveForm: () => void;
  onNewLabelChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveCurrent: () => void;
  onCancelSaveForm: () => void;
  onLoadClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Portaled cycle history shell and dialog content. */
const CycleHistoryModalDialog: React.FC<CycleHistoryModalDialogProps> = ({
  modalRef,
  currentCycle,
  savedCycles,
  showSaveForm,
  newLabel,
  onClose,
  onOpenSaveForm,
  onNewLabelChange,
  onSaveCurrent,
  onCancelSaveForm,
  onLoadClick,
  onDeleteClick,
}) => (
  <div className="history-modal-root notranslate">
    <div className="history-modal-overlay" onClick={onClose} aria-hidden="true" />
    <div
      className="history-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cycle-history-title"
      ref={modalRef}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="history-modal-header">
        <h2 id="cycle-history-title">Forecast Cycle History</h2>
        <button className="history-modal-close" onClick={onClose} aria-label="Close cycle history modal">
          ✕
        </button>
      </div>

      <div className="history-modal-body">
        <CycleHistoryCurrentSection
          currentCycle={currentCycle}
          showSaveForm={showSaveForm}
          newLabel={newLabel}
          onOpenSaveForm={onOpenSaveForm}
          onNewLabelChange={onNewLabelChange}
          onSaveCurrent={onSaveCurrent}
          onCancelSaveForm={onCancelSaveForm}
        />

        <div className="history-list-section">
          <h3>Saved Cycles ({savedCycles.length})</h3>
          <CycleHistorySavedList
            savedCycles={savedCycles}
            onLoadClick={onLoadClick}
            onDeleteClick={onDeleteClick}
          />
        </div>
      </div>

      <div className="history-modal-footer">
        <div className="history-footer-info">
          💡 Use Copy from Previous to reference older outlooks when creating new forecasts
        </div>
        <button className="history-btn-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  </div>
);

export default CycleHistoryModalDialog;
