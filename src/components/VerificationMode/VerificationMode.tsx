import React, { useRef, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import VerificationMap, { VerificationMapHandle } from '../Map/VerificationMap';
import VerificationPanel from '../Verification/VerificationPanel';
import { loadVerificationForecast, clearVerificationForecast } from '../../store/verificationSlice';
import { deserializeForecast, validateForecastData } from '../../utils/fileUtils';
import { DayType } from '../../types/outlooks';
import './VerificationMode.css';

const VerificationMode: React.FC = () => {
  const dispatch = useDispatch();
  const mapRef = useRef<VerificationMapHandle>(null);
  const [forecastLoaded, setForecastLoaded] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [activeOutlookType, setActiveOutlookType] = useState<'categorical' | 'tornado' | 'wind' | 'hail'>('categorical');
  const [selectedDay, setSelectedDay] = useState<DayType>(1);
  const [availableDays, setAvailableDays] = useState<DayType[]>([]);

  const handleLoadForecast = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);

        // Validate the forecast data
        if (!validateForecastData(json)) {
          alert('Invalid forecast file format. Please ensure it\'s a valid GFC forecast JSON.');
          return;
        }

        // Deserialize and import the forecast
        const deserialized = deserializeForecast(json);
        dispatch(loadVerificationForecast(deserialized));
        
        // Extract available days from the forecast cycle
        const daysWithData: DayType[] = [];
        if (deserialized.days) {
          (Object.keys(deserialized.days) as unknown as DayType[]).forEach((day) => {
            const dayData = deserialized.days[day];
            if (dayData) {
              daysWithData.push(day);
            }
          });
        }
        
        setAvailableDays(daysWithData.sort((a, b) => a - b));
        setSelectedDay(daysWithData[0] || 1);
        setForecastLoaded(true);

        alert('Forecast loaded successfully! You can now load storm reports to verify.');
      } catch (error) {
        console.error('Error loading forecast:', error);
        alert('Failed to load forecast file. Please ensure it\'s a valid GFC forecast JSON.');
      }
    };

    reader.readAsText(file);
  }, [dispatch]);

  const handleClearForecast = useCallback(() => {
    if (window.confirm('Clear the loaded forecast? This will also clear any storm reports.')) {
      dispatch(clearVerificationForecast());
      setForecastLoaded(false);
      setAvailableDays([]);
      setSelectedDay(1);
      setFileName('');
    }
  }, [dispatch]);

  return (
    <div className="verification-mode">
      <div className="verification-header">
        <h2>Forecast Verification Mode</h2>
        <p className="verification-subtitle">
          Load a saved forecast and compare it against actual storm reports
        </p>
      </div>

      {forecastLoaded && (
        <>
          <div className="day-selector-section">
            <label>Forecast Day:</label>
            <div className="day-selector-buttons">
              {availableDays.map((day) => (
                <button
                  key={day}
                  className={`day-btn ${selectedDay === day ? 'active' : ''}`}
                  onClick={() => setSelectedDay(day)}
                  title={`Day ${day}`}
                >
                  Day {day}
                </button>
              ))}
            </div>
          </div>
          
          <div className="outlook-type-selector">
            <label>View Outlook Type:</label>
            <div className="outlook-type-buttons">
              <button
                className={`outlook-type-btn ${activeOutlookType === 'categorical' ? 'active' : ''}`}
                onClick={() => setActiveOutlookType('categorical')}
              >
                📊 Categorical
              </button>
              <button
                className={`outlook-type-btn ${activeOutlookType === 'tornado' ? 'active' : ''}`}
                onClick={() => setActiveOutlookType('tornado')}
              >
                🌪️ Tornado
              </button>
              <button
                className={`outlook-type-btn ${activeOutlookType === 'wind' ? 'active' : ''}`}
                onClick={() => setActiveOutlookType('wind')}
              >
                💨 Wind
              </button>
              <button
                className={`outlook-type-btn ${activeOutlookType === 'hail' ? 'active' : ''}`}
                onClick={() => setActiveOutlookType('hail')}
              >
                🧊 Hail
              </button>
            </div>
          </div>
        </>
      )}

      <div className="verification-content">
        <div className="verification-sidebar">
          <div className="forecast-loader-section">
            <h3>Step 1: Load Forecast</h3>
            {!forecastLoaded ? (
              <div className="file-upload-area">
                <label htmlFor="forecast-file" className="file-upload-label">
                  <div className="upload-icon">📁</div>
                  <span>Choose Forecast File</span>
                  <input
                    type="file"
                    id="forecast-file"
                    accept=".json"
                    onChange={handleLoadForecast}
                    className="file-input"
                  />
                </label>
                <p className="upload-hint">
                  Select a .json forecast file exported from the Outlook Creator
                </p>
              </div>
            ) : (
              <div className="forecast-loaded">
                <div className="loaded-indicator">
                  <span className="checkmark">✓</span>
                  <div>
                    <strong>Forecast Loaded</strong>
                    <p className="file-name">{fileName}</p>
                  </div>
                </div>
                <button onClick={handleClearForecast} className="clear-forecast-btn">
                  Load Different Forecast
                </button>
              </div>
            )}
          </div>

          {forecastLoaded && (
            <div className="reports-section">
              <h3>Step 2: Load Storm Reports</h3>
              <VerificationPanel activeOutlookType={activeOutlookType} selectedDay={selectedDay} />
            </div>
          )}

          {!forecastLoaded && (
            <div className="waiting-message">
              <p>👈 Load a forecast to begin verification</p>
            </div>
          )}
        </div>

        <div className="verification-map-container">
          <VerificationMap ref={mapRef} activeOutlookType={activeOutlookType} selectedDay={selectedDay} />
        </div>
      </div>
    </div>
  );
};

export default VerificationMode;
