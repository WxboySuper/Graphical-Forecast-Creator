import React from 'react';
import type { SavedCycle } from '../../store/forecastSlice';
import type { ForecastCycle } from '../../types/outlooks';
import { getDaySummary } from './cycleHistoryModalUtils';

interface CycleHistorySavedListProps {
  savedCycles: SavedCycle[];
  onLoadClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const CycleHistorySavedList: React.FC<CycleHistorySavedListProps> = ({
  savedCycles,
  onLoadClick,
  onDeleteClick,
}) => {
  if (savedCycles.length === 0) {
    return (
      <div className="history-empty-state">
        <p>No saved cycles yet.</p>
        <p>Save your current cycle to build up a history for reference.</p>
      </div>
    );
  }

  return (
    <div className="history-list">
      {savedCycles
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((cycle) => (
          <div key={cycle.id} className="history-item">
            <div className="history-item-info">
              <div className="history-item-date">
                📅 {new Date(cycle.cycleDate).toLocaleDateString()}
                {cycle.label && <span className="history-item-label">{cycle.label}</span>}
              </div>
              <div className="history-item-meta">
                <span className="history-item-saved">
                  Saved: {new Date(cycle.timestamp).toLocaleString()}
                </span>
                <span className="history-item-summary">{getDaySummary(cycle)}</span>
              </div>
            </div>
            <div className="history-item-actions">
              <button
                className="history-btn-load"
                data-cycle-id={cycle.id}
                onClick={onLoadClick}
                title="Load this cycle"
              >
                Load
              </button>
              <button
                className="history-btn-delete"
                data-cycle-id={cycle.id}
                onClick={onDeleteClick}
                title="Delete this cycle"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
    </div>
  );
};

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
          💡 Use "Copy from Previous" to reference older outlooks when creating new forecasts
        </div>
        <button className="history-btn-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  </div>
);

export default CycleHistoryModalDialog;
