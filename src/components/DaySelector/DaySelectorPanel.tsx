import React, { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { FloatingPanel } from '../Layout';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
// Badge component available for future use
import { selectForecastCycle, setForecastDay, setCycleDate } from '../../store/forecastSlice';
import { DayType } from '../../types/outlooks';
import { cn } from '../../lib/utils';

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

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

export const DaySelectorPanel: React.FC = () => {
  const dispatch = useDispatch();
  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days } = forecastCycle;
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState(forecastCycle.cycleDate);

  // Helper to check if day has actual data (polygons)
  const hasDataForDay = useCallback((day: DayType) => {
    const outlookDay = days[day];
    if (!outlookDay) return false;
    const { data } = outlookDay;
    
    return (
      (data.tornado && data.tornado.size > 0) ||
      (data.wind && data.wind.size > 0) ||
      (data.hail && data.hail.size > 0) ||
      (data.totalSevere && data.totalSevere.size > 0) ||
      (data['day4-8'] && data['day4-8'].size > 0) ||
      (data.categorical && data.categorical.size > 0)
    );
  }, [days]);

  const handleDayChange = useCallback((day: DayType) => {
    dispatch(setForecastDay(day));
  }, [dispatch]);

  const handlePrevDay = useCallback(() => {
    if (currentDay > 1) {
      dispatch(setForecastDay((currentDay - 1) as DayType));
    }
  }, [currentDay, dispatch]);

  const handleNextDay = useCallback(() => {
    if (currentDay < 8) {
      dispatch(setForecastDay((currentDay + 1) as DayType));
    }
  }, [currentDay, dispatch]);

  const handleDateSave = useCallback(() => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  }, [dispatch, tempDate]);

  // Keyboard shortcuts for day navigation (1-8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const num = parseInt(e.key);
      if (num >= 1 && num <= 8) {
        dispatch(setForecastDay(num as DayType));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  return (
    <TooltipProvider>
      <FloatingPanel
        title="Forecast Day"
        position="top-left"
        icon={<Calendar className="h-4 w-4" />}
        minWidth={280}
      >
        <div className="space-y-3">
          {/* Cycle Date */}
          <div className="flex items-center justify-between">
            {isEditingDate ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="date"
                  value={tempDate}
                  onChange={(e) => setTempDate(e.target.value)}
                  className="h-8 flex-1"
                />
                <Button size="icon-sm" variant="success" onClick={handleDateSave}>
                  ✓
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setIsEditingDate(false)}>
                  ✕
                </Button>
              </div>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">
                  {new Date(forecastCycle.cycleDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => {
                    setTempDate(forecastCycle.cycleDate);
                    setIsEditingDate(true);
                  }}
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {/* Day Navigation */}
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handlePrevDay}
              disabled={currentDay === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex-1 grid grid-cols-8 gap-1">
              {DAYS.map((day) => {
                const hasData = hasDataForDay(day);
                const isActive = currentDay === day;

                return (
                  <Tooltip key={day}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleDayChange(day)}
                        className={cn(
                          'relative h-8 w-full text-xs font-medium rounded-md transition-all',
                          'hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-secondary text-secondary-foreground'
                        )}
                      >
                        {day}
                        {hasData && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 bg-success rounded-full" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Day {day}</p>
                      <p className="text-xs text-muted-foreground">{getDayDescription(day)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Press {day} to select</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleNextDay}
              disabled={currentDay === 8}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day Info */}
          <div className="text-xs text-muted-foreground text-center">
            {getDayDescription(currentDay)}
          </div>
        </div>
      </FloatingPanel>
    </TooltipProvider>
  );
};

export default DaySelectorPanel;
