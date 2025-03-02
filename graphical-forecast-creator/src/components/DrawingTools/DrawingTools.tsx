import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resetForecasts } from '../../store/forecastSlice';
import { RootState } from '../../store';
import './DrawingTools.css';

interface DrawingToolsProps {
  onSave: () => void;
  onLoad: () => void;
}

const DrawingTools: React.FC<DrawingToolsProps> = ({ onSave, onLoad }) => {
  const dispatch = useDispatch();
  const { isSaved } = useSelector((state: RootState) => state.forecast);

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all forecasts? This action cannot be undone.')) {
      dispatch(resetForecasts());
    }
  };

  const handleExport = () => {
    // This will be implemented later
    alert('Export functionality coming soon!');
  };

  return (
    <div className="drawing-tools">
      <h3>Drawing Tools</h3>
      <div className="tools-container">
        <button 
          className="tool-button save-button" 
          onClick={onSave}
          disabled={isSaved}
        >
          <span className="tool-icon">💾</span>
          <span className="tool-label">Save Forecast</span>
        </button>
        <button 
          className="tool-button load-button" 
          onClick={onLoad}
        >
          <span className="tool-icon">📂</span>
          <span className="tool-label">Load Forecast</span>
        </button>
        <button 
          className="tool-button export-button" 
          onClick={handleExport}
        >
          <span className="tool-icon">📤</span>
          <span className="tool-label">Export as Image</span>
        </button>
        <button 
          className="tool-button reset-button" 
          onClick={handleReset}
        >
          <span className="tool-icon">🗑️</span>
          <span className="tool-label">Reset All</span>
        </button>
      </div>
      <div className="tools-help">
        <p>
          <strong>Drawing Instructions:</strong> Select an outlook type and probability, then use the drawing tools on the map to create your forecast areas.
        </p>
        <p>
          <strong>Click on any drawn area to delete it.</strong>
        </p>
        {!isSaved && (
          <p className="unsaved-warning">
            ⚠️ You have unsaved changes
          </p>
        )}
      </div>
    </div>
  );
};

export default DrawingTools;