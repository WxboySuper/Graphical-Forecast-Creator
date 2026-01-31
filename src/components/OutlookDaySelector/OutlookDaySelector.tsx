import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectForecastCycle, setForecastDay, setCycleDate } from '../../store/forecastSlice';
import { DayType } from '../../types/outlooks';
import './OutlookDaySelector.css';

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

const OutlookDaySelector: React.FC = () => {
  const dispatch = useDispatch();
  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days } = forecastCycle;
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState(forecastCycle.cycleDate);

  const handleDayChange = (day: DayType) => {
    dispatch(setForecastDay(day));
  };

  const handleDateEdit = () => {
    setTempDate(forecastCycle.cycleDate);
    setIsEditingDate(true);
  };

  const handleDateSave = () => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  };

  const handleDateCancel = () => {
    setTempDate(forecastCycle.cycleDate);
    setIsEditingDate(false);
  };

  // Helper to check if day has actual data (polygons)
  const hasDataForDay = (day: DayType) => {
    const outlookDay = days[day];
    if (!outlookDay) return false;
    const { data } = outlookDay;
    
    // Check each outlook map that exists for this day
    return (
      (data.tornado && data.tornado.size > 0) ||
      (data.wind && data.wind.size > 0) ||
      (data.hail && data.hail.size > 0) ||
      (data.totalSevere && data.totalSevere.size > 0) ||
      (data['day4-8'] && data['day4-8'].size > 0) ||
      (data.categorical && data.categorical.size > 0)
    );
  };
  
  // Get description for each day type
  const getDayDescription = (day: DayType): string => {
    if (day === 1 || day === 2) {
      return 'Tornado, Wind, Hail, Categorical';
    } else if (day === 3) {
      return 'Total Severe, Categorical';
    } else {
      return '15% and 30% only';
    }
  };

  return (
    <div className="day-selector-container">
      <div className="day-selector-label">
        {isEditingDate ? (
          <div className="cycle-date-editor">
            <input
              type="date"
              value={tempDate}
              onChange={(e) => setTempDate(e.target.value)}
              className="cycle-date-input"
            />
            <button onClick={handleDateSave} className="cycle-date-btn save" title="Save">
              ✓
            </button>
            <button onClick={handleDateCancel} className="cycle-date-btn cancel" title="Cancel">
              ✕
            </button>
          </div>
        ) : (
          <>
            Forecast Cycle: {new Date(forecastCycle.cycleDate).toLocaleDateString()}
            <button onClick={handleDateEdit} className="cycle-date-edit-btn" title="Change cycle date">
              📅
            </button>
          </>
        )}
      </div>
      <div className="day-tabs" role="tablist">
        {DAYS.map((day) => {
          const hasData = hasDataForDay(day);
          
          return (
            <button
              key={day}
              role="tab"
              aria-selected={currentDay === day}
              className={`day-tab ${currentDay === day ? 'active' : ''} ${hasData ? 'has-data' : ''}`}
              onClick={() => handleDayChange(day)}
              title={getDayDescription(day)}
            >
              Day {day}
              {hasData && <span className="data-indicator" aria-label="Has data">•</span>}
            </button>
          );
        })}
      </div>
      <div className="day-info-text">
        {getDayDescription(currentDay)}
      </div>
    </div>
  );
};

export default OutlookDaySelector;
