import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resetForecasts } from '../../store/forecastSlice';
import { RootState } from '../../store';
import { ForecastMapHandle } from '../Map/ForecastMap';
import { exportMapAsImage } from '../../utils/exportUtils';
import './DrawingTools.css';

interface DrawingToolsProps {
  onSave: () => void;
  onLoad: () => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
}

const DrawingTools: React.FC<DrawingToolsProps> = ({ onSave, onLoad, mapRef }) => {
  const dispatch = useDispatch();
  const { isSaved } = useSelector((state: RootState) => state.forecast);
  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  
  const isExportDisabled = !featureFlags.exportMapEnabled;
  const isSaveLoadDisabled = !featureFlags.saveLoadEnabled;

  const handleExport = async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    try {
      const dataUrl = await exportMapAsImage(map);
      const link = document.createElement('a');
      link.download = 'forecast-map.png';
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to export map:', error);
      alert('Failed to export map. Please try again.');
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all forecasts? This action cannot be undone.')) {
      dispatch(resetForecasts());
    }
  };

  return (
    <div className="drawing-tools">
      <h3>Drawing Tools</h3>
      <div className="tools-container">
        <div className="tooltip">
          <button 
            className={`tool-button ${isSaveLoadDisabled ? 'button-disabled' : 'save-button'}`}
            onClick={isSaveLoadDisabled ? undefined : onSave}
            disabled={isSaveLoadDisabled || isSaved}
          >
            <span className="tool-icon">💾</span>
            <span className="tool-label">Save Forecast</span>
            {isSaveLoadDisabled && <span className="maintenance-badge">!</span>}
          </button>
          {isSaveLoadDisabled && (
            <span className="tooltip-text">
              Save feature is temporarily unavailable
            </span>
          )}
        </div>
        
        <div className="tooltip">
          <button 
            className={`tool-button ${isSaveLoadDisabled ? 'button-disabled' : 'load-button'}`}
            onClick={isSaveLoadDisabled ? undefined : onLoad}
            disabled={isSaveLoadDisabled}
          >
            <span className="tool-icon">📂</span>
            <span className="tool-label">Load Forecast</span>
            {isSaveLoadDisabled && <span className="maintenance-badge">!</span>}
          </button>
          {isSaveLoadDisabled && (
            <span className="tooltip-text">
              Load feature is temporarily unavailable
            </span>
          )}
        </div>
        
        <div className="tooltip">
          <button 
            className={`tool-button ${isExportDisabled ? 'export-button-disabled' : 'export-button'}`}
            onClick={isExportDisabled ? undefined : handleExport}
            disabled={isExportDisabled}
          >
            <span className="tool-icon">📤</span>
            <span className="tool-label">Export as Image</span>
            {isExportDisabled && <span className="maintenance-badge">!</span>}
          </button>
          {isExportDisabled && (
            <span className="tooltip-text">
              Export feature is temporarily unavailable while being rebuilt
            </span>
          )}
        </div>
        
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
        {isExportDisabled && (
          <p className="unsaved-warning">
            ⚠️ The export feature is temporarily unavailable while being rebuilt
          </p>
        )}
        {isSaveLoadDisabled && (
          <p className="unsaved-warning">
            ⚠️ The save/load features are temporarily unavailable due to an issue.
          </p>
        )}
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