import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  selectSavedCycles, 
  selectForecastCycle,
  saveCurrentCycle, 
  loadSavedCycle, 
  deleteSavedCycle 
} from '../../store/forecastSlice';
import { useAppLayout } from '../Layout/AppLayout';
import './CycleHistoryModal.css';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';

interface CycleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CycleHistoryModal: React.FC<CycleHistoryModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { addToast } = useAppLayout();
  const savedCycles = useSelector(selectSavedCycles);
  const currentCycle = useSelector(selectForecastCycle);
  
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (confirmAction) {
          setConfirmAction(null);
        } else {
          onClose();
        }
        return;
      }
      if (event.key === 'Tab' && modalRef.current && !confirmAction) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, confirmAction]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const first = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )[0];
    first?.focus();
  }, [isOpen]);

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
        onClose();
      }
    });
  };

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

  const getDaySummary = (cycle: any) => {
    const days = Object.keys(cycle.forecastCycle.days);
    if (days.length === 0) return 'No data';
    
    const daysWithData = days.filter(dayKey => {
      const day = cycle.forecastCycle.days[dayKey as any];
      if (!day) return false;
      
      // Check if any outlook map has features
      return Object.keys(day.data).some(outlookKey => {
        const map = day.data[outlookKey as any];
        return map && map.size > 0;
      });
    });
    
    return daysWithData.length > 0 
      ? `Days: ${daysWithData.join(', ')}` 
      : 'No polygons';
  };

  return (
    <>
      <div className="history-modal-overlay" onClick={onClose}></div>
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
                onClick={() => setShowSaveForm(true)}
              >
                💾 Save Current Cycle
              </button>
            ) : (
              <div className="history-save-form">
                <input
                  type="text"
                  placeholder="Optional label (e.g., Morning, Afternoon, 00Z)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="history-label-input"
                  maxLength={50}
                />
                <div className="history-save-form-buttons">
                  <button className="history-btn-save-confirm" onClick={handleSaveCurrent}>
                    Save
                  </button>
                  <button className="history-btn-save-cancel" onClick={() => {
                    setShowSaveForm(false);
                    setNewLabel('');
                  }}>
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
                          onClick={() => handleLoadCycle(cycle.id)}
                          title="Load this cycle"
                        >
                          Load
                        </button>
                        <button
                          className="history-btn-delete"
                          onClick={() => handleDeleteCycle(cycle.id)}
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
          onCancel={() => setConfirmAction(null)}
          confirmLabel="Confirm"
          cancelLabel="Cancel"
        />
      )}
    </>
  );
};

export default CycleHistoryModal;
