import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectForecastCycle, setForecastDay, setCycleDate } from '../../store/forecastSlice';
import { DayType } from '../../types/outlooks';
import './OutlookDaySelector.css';

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

type ForecastDays = ReturnType<typeof selectForecastCycle>['days'];

// Helper function to determine if a given forecast day has any data (polygons) associated with it, which is used to indicate in the UI whether a day has forecast information available. It checks each type of outlook data for the specified day and returns true if any of them contain data, allowing the UI to display an indicator for days that have forecast information.
const hasOutlookDataForDay = (days: ForecastDays, day: DayType): boolean => {
  const outlookDay = days[day];
  if (!outlookDay) return false;

  const { data } = outlookDay;
  const keys = ['tornado', 'wind', 'hail', 'totalSevere', 'day4-8', 'categorical'] as const;
  const dataRecord = data as Record<string, { size?: number } | undefined>;

  return keys.some((k) => (dataRecord[k]?.size ?? 0) > 0);
};

// Component for selecting the forecast day and viewing the cycle date in the Outlook mode. It displays the current forecast cycle date with an option to edit it, and a set of tabs for each forecast day (1-8) that users can click to switch between days. Each day tab also indicates whether there is data available for that day, and hovering over the tabs shows a description of the outlook types included for that day.
const getDayDescription = (day: DayType): string => {
  // Use a map for better readability and maintainability instead of multiple if-else statements
  const map = new Map<DayType, string>([
    [1, 'Tornado, Wind, Hail, Categorical'],
    [2, 'Tornado, Wind, Hail, Categorical'],
    [3, 'Total Severe, Categorical'],
  ]);

  return map.get(day) ?? '15% and 30% only';
};

// Main component for the outlook day selector, which manages the state for the current forecast cycle and allows users to select different forecast days and edit the cycle date. It uses the Redux store to access and update the forecast cycle state, and it renders the UI for selecting days and editing the cycle date, as well as displaying indicators for which days have forecast data available.
const CycleDateControl: React.FC<{
  isEditingDate: boolean;
  tempDate: string;
  cycleDate: string;
  onTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDateSave: () => void;
  onDateCancel: () => void;
  onDateEdit: () => void;
}> = ({
  isEditingDate,
  tempDate,
  cycleDate,
  onTempDateChange,
  onDateSave,
  onDateCancel,
  onDateEdit
}) => {
  if (isEditingDate) {
    return (
      <div className="cycle-date-editor">
        <input
          type="date"
          value={tempDate}
          onChange={onTempDateChange}
          className="cycle-date-input"
        />
        <button onClick={onDateSave} className="cycle-date-btn save" title="Save">
          ✓
        </button>
        <button onClick={onDateCancel} className="cycle-date-btn cancel" title="Cancel">
          ✕
        </button>
      </div>
    );
  }

  return (
    <>
      Forecast Cycle: {new Date(cycleDate).toLocaleDateString()}
      <button onClick={onDateEdit} className="cycle-date-edit-btn" title="Change cycle date">
        📅
      </button>
    </>
  );
};

// Component for the day tabs in the outlook day selector, which renders a button for each forecast day (1-8) that users can click to select a day. Each button indicates whether it is the currently selected day and whether that day has forecast data available, and hovering over the buttons shows a description of the outlook types included for that day. The component receives the current selected day, the forecast days data, and a click handler as props to manage the state and interactions for selecting different forecast days.
const DayTabs: React.FC<{
  currentDay: DayType;
  days: ForecastDays;
  onDayButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ currentDay, days, onDayButtonClick }) => (
  <div className="day-tabs" role="tablist">
    {DAYS.map((day) => {
      const hasData = hasOutlookDataForDay(days, day);

      return (
        <button
          key={day}
          role="tab"
          aria-selected={currentDay === day}
          className={`day-tab ${currentDay === day ? 'active' : ''} ${hasData ? 'has-data' : ''}`}
          data-day={day}
          onClick={onDayButtonClick}
          title={getDayDescription(day)}
        >
          Day {day}
          {hasData && <span className="data-indicator" aria-label="Has data">•</span>}
        </button>
      );
    })}
  </div>
);

// Component for selecting the forecast day and viewing the cycle date in the Outlook mode. It displays the current forecast cycle date with an option to edit it, and a set of tabs for each forecast day (1-8) that users can click to switch between days. Each day tab also indicates whether there is data available for that day, and hovering over the tabs shows a description of the outlook types included for that day.
const OutlookDaySelector: React.FC = () => {
  const dispatch = useDispatch();
  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days } = forecastCycle;
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState(forecastCycle.cycleDate);

  // Handler for changing the selected forecast day, which dispatches an action to update the current day in the forecast cycle state.
  const handleDayChange = (day: DayType) => {
    dispatch(setForecastDay(day));
  };

  // Handler for navigating to the previous day, which checks if the current day is greater than 1 and dispatches an action to set the current day to the previous day.
  const handleDateEdit = () => {
    setTempDate(forecastCycle.cycleDate);
    setIsEditingDate(true);
  };

  // Handler for navigating to the next day, which checks if the current day is less than 8 and dispatches an action to set the current day to the next day.
  const handleDateSave = () => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  };

  // Handler for canceling the date edit, which resets the temporary date to the current cycle date and exits the editing mode without saving changes.
  const handleDateCancel = () => {
    setTempDate(forecastCycle.cycleDate);
    setIsEditingDate(false);
  };

  // Helper to check if day has actual data (polygons)
  const handleTempDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempDate(e.target.value);
  };

  // Handler for day tab button clicks
  const handleDayButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(e.currentTarget.dataset.day) as DayType;
    if (Number.isNaN(day)) {
      return;
    }

    handleDayChange(day);
  };

  return (
    <div className="day-selector-container">
      <div className="day-selector-label">
        <CycleDateControl
          isEditingDate={isEditingDate}
          tempDate={tempDate}
          cycleDate={forecastCycle.cycleDate}
          onTempDateChange={handleTempDateChange}
          onDateSave={handleDateSave}
          onDateCancel={handleDateCancel}
          onDateEdit={handleDateEdit}
        />
      </div>
      <DayTabs currentDay={currentDay} days={days} onDayButtonClick={handleDayButtonClick} />
      <div className="day-info-text">
        {getDayDescription(currentDay)}
      </div>
    </div>
  );
};

export default OutlookDaySelector;
