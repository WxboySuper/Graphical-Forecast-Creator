import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { selectForecastCycle } from '../store/forecastSlice';
import { serializeForecast } from '../utils/fileUtils';
import { getScopedStorageKey, getStorageScope } from '../utils/storageScope';

const AUTOSAVE_DELAY = 5000; // 5 seconds debounce
const LOCAL_STORAGE_KEY = 'forecastData';

export const getAutoSaveStorageKey = (userId?: string | null): string =>
  userId ? getScopedStorageKey(LOCAL_STORAGE_KEY, getStorageScope(userId)) : LOCAL_STORAGE_KEY;

export const useAutoSave = (userId?: string | null) => {
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

    timerRef.current = setTimeout(() => {
      try {
        const data = serializeForecast(forecastCycle, mapView, workflowMetadata);
        localStorage.setItem(getAutoSaveStorageKey(userId), JSON.stringify(data));
      } catch {
        // Auto-save silently fails to avoid disrupting the user
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [forecastCycle, mapView, userId, workflowMetadata]);
};
