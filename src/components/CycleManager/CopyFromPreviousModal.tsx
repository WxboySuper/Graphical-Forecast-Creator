import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectSavedCycles, selectCurrentDay, copyFeaturesFromPrevious } from '../../store/forecastSlice';
import { DayType } from '../../types/outlooks';
import './CopyFromPreviousModal.css';

interface CopyFromPreviousModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

const CopyFromPreviousModal: React.FC<CopyFromPreviousModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const savedCycles = useSelector(selectSavedCycles);
  const currentDay = useSelector(selectCurrentDay);

  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [sourceDay, setSourceDay] = useState<DayType>(1);
  const [targetDay, setTargetDay] = useState<DayType>(currentDay);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!selectedCycleId) {
      alert('Please select a source cycle');
      return;
    }

    dispatch(copyFeaturesFromPrevious({
      sourceCycleId: selectedCycleId,
      sourceDay,
      targetDay
    }));

    alert(`Copied features from ${new Date(savedCycles.find(c => c.id === selectedCycleId)?.cycleDate || '').toLocaleDateString()} Day ${sourceDay} to current cycle Day ${targetDay}`);
    onClose();
  };

  return (
    <>
      <div className="copy-modal-overlay" onClick={onClose}></div>
      <div className="copy-modal">
        <div className="copy-modal-header">
          <h2>Copy from Previous Cycle</h2>
          <button className="copy-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="copy-modal-body">
          {savedCycles.length === 0 ? (
            <div className="copy-empty-state">
              <p>No saved cycles available.</p>
              <p>Save your current cycle first using the "Cycle History" menu.</p>
            </div>
          ) : (
            <>
              <div className="copy-form-group">
                <label htmlFor="source-cycle">Source Cycle:</label>
                <select
                  id="source-cycle"
                  value={selectedCycleId}
                  onChange={(e) => setSelectedCycleId(e.target.value)}
                  className="copy-select"
                >
                  <option value="">-- Select a cycle --</option>
                  {savedCycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {new Date(cycle.cycleDate).toLocaleDateString()}
                      {cycle.label ? ` - ${cycle.label}` : ''}
                      {' '}(Saved: {new Date(cycle.timestamp).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="copy-days-row">
                <div className="copy-form-group">
                  <label htmlFor="source-day">From Day:</label>
                  <select
                    id="source-day"
                    value={sourceDay}
                    onChange={(e) => setSourceDay(Number(e.target.value) as DayType)}
                    className="copy-select"
                  >
                    {DAYS.map((day) => (
                      <option key={day} value={day}>
                        Day {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="copy-arrow">→</div>

                <div className="copy-form-group">
                  <label htmlFor="target-day">To Day (Current Cycle):</label>
                  <select
                    id="target-day"
                    value={targetDay}
                    onChange={(e) => setTargetDay(Number(e.target.value) as DayType)}
                    className="copy-select"
                  >
                    {DAYS.map((day) => (
                      <option key={day} value={day}>
                        Day {day}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="copy-info-box">
                <strong>Note:</strong> This will copy all outlook features (tornado, wind, hail, categorical, etc.) 
                from the selected source to the target day in your current cycle. 
                Existing features on the target day will be replaced.
              </div>
            </>
          )}
        </div>

        <div className="copy-modal-footer">
          <button className="copy-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          {savedCycles.length > 0 && (
            <button 
              className="copy-btn-copy" 
              onClick={handleCopy}
              disabled={!selectedCycleId}
            >
              Copy Features
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default CopyFromPreviousModal;
