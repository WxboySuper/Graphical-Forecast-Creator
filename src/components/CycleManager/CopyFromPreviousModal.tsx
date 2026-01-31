import React, { useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentDay, copyFeaturesFromPrevious } from '../../store/forecastSlice';
import { DayType, ForecastCycle } from '../../types/outlooks';
import { deserializeForecast } from '../../utils/fileUtils';
import './CopyFromPreviousModal.css';

interface CopyFromPreviousModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

const CopyFromPreviousModal: React.FC<CopyFromPreviousModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const currentDay = useSelector(selectCurrentDay);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadedCycle, setLoadedCycle] = useState<ForecastCycle | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [sourceDay, setSourceDay] = useState<DayType>(1);
  const [targetDay, setTargetDay] = useState<DayType>(currentDay);

  if (!isOpen) return null;

  const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        const cycle = deserializeForecast(parsed);
        setLoadedCycle(cycle);
        setLoadedFileName(file.name);
      } catch (error) {
        alert('Failed to load forecast file. Please ensure it\'s a valid GFC JSON file.');
        console.error('File load error:', error);
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopy = () => {
    if (!loadedCycle) {
      alert('Please load a forecast file first');
      return;
    }

    dispatch(copyFeaturesFromPrevious({
      sourceCycle: loadedCycle,
      sourceDay,
      targetDay
    }));

    alert(`Copied features from ${loadedFileName} Day ${sourceDay} to current cycle Day ${targetDay}`);
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
          <>
            <div className="copy-form-group">
              <label>Load Forecast File:</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileLoad}
                className="copy-file-input"
              />
              {loadedCycle && (
                <div className="copy-loaded-info">
                  ✓ Loaded: {loadedFileName} (Cycle Date: {new Date(loadedCycle.cycleDate).toLocaleDateString()})
                </div>
              )}
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
              <strong>Note:</strong> This will copy outlook features from the loaded file to your current cycle.
              The system will automatically convert outlook types when copying between days with different formats
              (e.g., Day 4-8 → Day 3, Day 3 → Day 2). Existing features on the target day will be replaced.
            </div>
          </>
        </div>

        <div className="copy-modal-footer">
          <button className="copy-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="copy-btn-copy" 
            onClick={handleCopy}
            disabled={!loadedCycle}
          >
            Copy Features
          </button>
        </div>
      </div>
    </>
  );
};

export default CopyFromPreviousModal;
