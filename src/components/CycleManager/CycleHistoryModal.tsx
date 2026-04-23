import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  selectSavedCycles, 
  selectForecastCycle,
  saveCurrentCycle, 
  loadSavedCycle, 
  deleteSavedCycle,
  SavedCycle
} from '../../store/forecastSlice';
import { DayType, OutlookData } from '../../types/outlooks';
import { useAppLayout } from '../Layout/AppLayout';
import './CycleHistoryModal.css';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';

interface CycleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Modal for browsing, saving, loading, and deleting saved forecast cycles. */
const CycleHistoryModal: React.FC<CycleHistoryModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { addToast } = useAppLayout();
  const savedCycles = useSelector(selectSavedCycles);
  const currentCycle = useSelector(selectForecastCycle);
  
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // Accessibility helpers: get focusable elements inside a modal and handle Tab navigation
  const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => {
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ));
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

  // Top-level keydown handler for the modal that delegates to Tab navigation or close logic.
  // Keeps modal-specific conditional branches out of the main effect for readability.
  const handleModalKeyDown = React.useCallback((event: KeyboardEvent) => {
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
  }, [onClose, confirmAction, handleTabNavigation]);

  useEffect(() => {
    if (!isOpen) return;

    // Synchronize focus when the modal opens
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

  /** Dispatches saveCurrentCycle with the current label, then resets the save form and shows a success toast. */
  const handleSaveCurrent = () => {
    dispatch(saveCurrentCycle({ label: newLabel.trim() || undefined }));
    setNewLabel('');
    setShowSaveForm(false);
    addToast('Cycle saved successfully!', 'success');
  };

  /** Prompts the user to confirm before dispatching loadSavedCycle, replacing the current forecast cycle. */
  const handleLoadCycle = (cycleId: string) => {
    setConfirmAction({
      title: 'Load Cycle',
      message: 'Load this cycle? Unsaved changes to your current cycle will be lost.',
      onConfirm: () => {
        dispatch(loadSavedCycle(cycleId));
        addToast('Cycle loaded!', 'success');
        setConfirmAction(null);
        onClose();
      }
    });
  };

  /** Prompts the user to confirm before dispatching deleteSavedCycle to remove a saved cycle permanently. */
  const handleDeleteCycle = (cycleId: string) => {
    setConfirmAction({
      title: 'Delete Cycle',
      message: 'Delete this saved cycle permanently?',
      onConfirm: () => {
        dispatch(deleteSavedCycle(cycleId));
        setConfirmAction(null);
      }
    });
  };

  // Handler to open the save form
  const handleOpenSaveForm = () => {
    setShowSaveForm(true);
  };

  // Handler for changes in the new label input field
  const handleNewLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewLabel(e.target.value);
  };

  // Handler to cancel the save form
  const handleCancelSaveForm = () => {
    setShowSaveForm(false);
    setNewLabel('');
  };

  // Note: The "Copy from Previous" modal is only relevant if there is a previous cycle to copy from. In a real implementation, you might want to check if that data exists before allowing the modal to open, and show a toast or disable the button if not.
  const handleCycleLoadClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const cycleId = e.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleLoadCycle(cycleId);
  };

  // Note: The "Copy from Previous" modal is only relevant if there is a previous cycle to copy from. In a real implementation, you might want to check if that data exists before allowing the modal to open, and show a toast or disable the button if not.
  const handleCycleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const cycleId = e.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleDeleteCycle(cycleId);
  };

  // Handler to cancel any confirmation action (just closes the confirmation modal)
  const handleCancelConfirmAction = () => {
    setConfirmAction(null);
  };

  /** Builds a short saved-cycle summary, preferring cached stats metadata when it is available. */
  const getDaySummary = (cycle: SavedCycle): string => {
    if (typeof cycle.stats?.forecastDays === 'number') {
      if (cycle.stats.forecastDays > 0) {
        const label = cycle.stats.forecastDays === 1 ? 'forecast day' : 'forecast days';
        return `${cycle.stats.forecastDays} ${label}`;
      }
      return 'No polygons';
    }

    const days = cycle.forecastCycle?.days;
    if (!days) return 'No data';

    const keys = Object.keys(days);
    if (keys.length === 0) return 'No data';

    const hasData = (dayKey: string): boolean => {
      const day = days[Number(dayKey) as DayType];
      if (!day) return false;
      const data = day.data;
      if (!data) return false;
      const outlookKeys = Object.keys(data);
      return outlookKeys.some((outlookKey) => {
        const map = data[outlookKey as keyof OutlookData];
        return Boolean(map && map.size > 0);
      });
    };

    const daysWithData = keys.filter(hasData);
    return daysWithData.length > 0 ? `Days: ${daysWithData.join(', ')}` : 'No polygons';
  };

  return (
    <>
      <div className="history-modal-overlay" onClick={onClose} />
      <div
        className="history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cycle-history-title"
        ref={modalRef}
      >
        <div className="history-modal-header">
          <h2 id="cycle-history-title">Forecast Cycle History</h2>
          <button className="history-modal-close" onClick={onClose} aria-label="Close cycle history modal">✕</button>
        </div>

        <div className="history-modal-body">
          {/* Current Cycle Info */}
          <div className="history-current-section">
            <h3>Current Cycle</h3>
            <div className="history-current-info">
              <strong>Date:</strong> {new Date(currentCycle.cycleDate).toLocaleDateString()}<br />
              <strong>Active Day:</strong> Day {currentCycle.currentDay}<br />
              <strong>Days with data:</strong> {Object.keys(currentCycle.days).length}
            </div>
            
            {!showSaveForm ? (
              <button 
                className="history-btn-save-current" 
                onClick={handleOpenSaveForm}
              >
                💾 Save Current Cycle
              </button>
            ) : (
              <div className="history-save-form">
                <input
                  type="text"
                  placeholder="Optional label (e.g., Morning, Afternoon, 00Z)"
                  value={newLabel}
                  onChange={handleNewLabelChange}
                  className="history-label-input"
                  maxLength={50}
                />
                <div className="history-save-form-buttons">
                  <button className="history-btn-save-confirm" onClick={handleSaveCurrent}>
                    Save
                  </button>
                  <button className="history-btn-save-cancel" onClick={handleCancelSaveForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Saved Cycles List */}
          <div className="history-list-section">
            <h3>Saved Cycles ({savedCycles.length})</h3>
            
            {savedCycles.length === 0 ? (
              <div className="history-empty-state">
                <p>No saved cycles yet.</p>
                <p>Save your current cycle to build up a history for reference.</p>
              </div>
            ) : (
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
                          <span className="history-item-summary">
                            {getDaySummary(cycle)}
                          </span>
                        </div>
                      </div>
                      <div className="history-item-actions">
                        <button
                          className="history-btn-load"
                          data-cycle-id={cycle.id}
                          onClick={handleCycleLoadClick}
                          title="Load this cycle"
                        >
                          Load
                        </button>
                        <button
                          className="history-btn-delete"
                          data-cycle-id={cycle.id}
                          onClick={handleCycleDeleteClick}
                          title="Delete this cycle"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
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
      {confirmAction && (
        <ConfirmationModal
          isOpen={true}
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={handleCancelConfirmAction}
          confirmLabel="Confirm"
          cancelLabel="Cancel"
        />
      )}
    </>
  );
};

export default CycleHistoryModal;
