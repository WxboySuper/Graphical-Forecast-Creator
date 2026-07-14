import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { selectForecastCycle } from '../store/forecastSlice';
import { serializeForecast } from '../utils/fileUtils';

const AUTOSAVE_DELAY = 5000; // 5 seconds debounce
const LOCAL_STORAGE_KEY = 'forecastData';

/** Serializes the latest forecast snapshot into the anonymous autosave slot. */
const persistAutoSave = (forecastCycle: ReturnType<typeof selectForecastCycle>, mapView: RootState['forecast']['currentMapView'], workflowMetadata: RootState['forecast']['workflowMetadata']): void => {
  try {
    const data = serializeForecast(forecastCycle, mapView, workflowMetadata);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Auto-save silently fails to avoid disrupting the user
  }
};

export const useAutoSave = () => {
  const forecastCycle = useSelector(selectForecastCycle);
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const workflowMetadata = useSelector((state: RootState) => state.forecast.workflowMetadata);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => persistAutoSave(forecastCycle, mapView, workflowMetadata), AUTOSAVE_DELAY);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [forecastCycle, mapView, workflowMetadata]);
};
