import React, { useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import ForecastMap, { ForecastMapHandle } from '../components/Map/ForecastMap';
import { IntegratedToolbar } from '../components/IntegratedToolbar/IntegratedToolbar';
import { RootState } from '../store';
import { 
  importForecastCycle, 
  markAsSaved, 
  setMapView,
  setActiveOutlookType,
  setActiveProbability,
  toggleSignificant,
  setEmergencyMode,
  selectForecastCycle,
  setForecastDay,
} from '../store/forecastSlice';
import { OutlookType, Probability, OutlookData, DayType } from '../types/outlooks';
import { deserializeForecast, validateForecastData, exportForecastToJson } from '../utils/fileUtils';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from '../utils/featureFlagsUtils';
import { useAutoSave } from '../hooks/useAutoSave';
import { useCycleHistoryPersistence } from '../utils/cycleHistoryPersistence';
import useAutoCategorical from '../hooks/useAutoCategorical';
import type { AddToastFn } from '../components/Layout';
import { featureGroup, geoJSON, Map as LeafletMap } from 'leaflet';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';

interface PageContext {
  addToast: AddToastFn;
}

// Helper to get probability list based on outlook type
const getProbabilityList = (activeOutlookType: string) => {
  switch (activeOutlookType) {
    case 'categorical':
      return ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'] as readonly string[];
    case 'tornado':
      return ['2%', '5%', '10%', '15%', '30%', '45%', '60%'] as readonly string[];
    case 'wind':
    case 'hail':
      return ['5%', '15%', '30%', '45%', '60%'] as readonly string[];
    default:
      return [] as readonly string[];
  }
};

// Component for emergency mode message
const EmergencyModeMessage: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-background">
    <div className="max-w-lg p-8 text-center">
      <h2 className="text-2xl font-bold text-foreground mb-4">⚠️ Application in Emergency Mode</h2>
      <p className="text-muted-foreground mb-4">
        All outlook types are currently disabled. This is typically done during critical maintenance 
        or when addressing severe issues.
      </p>
      <p className="text-muted-foreground mb-4">
        The application&apos;s drawing capabilities have been temporarily suspended. 
        Please check back later or contact the administrator.
      </p>
      <p className="text-muted-foreground">
        For more information visit the{' '}
        <a 
          href="https://github.com/WxboySuper/Graphical-Forecast-Creator/issues?q=is%3Aissue%20state%3Aopen%20label%3AEmergency"
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub repository
        </a>.
      </p>
    </div>
  </div>
);

// Helper function to fit map to feature bounds
const fitMapToFeatures = (map: LeafletMap, outlooks: OutlookData, dispatch: ReturnType<typeof useDispatch>) => {
  const allFeatures = featureGroup();

  for (const outlookMap of Object.values(outlooks)) {
    for (const features of Array.from(outlookMap.values())) {
      for (const feature of (features as Feature<Geometry, GeoJsonProperties>[])) {
        geoJSON(feature).addTo(allFeatures);
      }
    }
  }

  if (allFeatures.getLayers().length > 0) {
    const bounds = allFeatures.getBounds();
    map.fitBounds(bounds, { padding: [50, 50] });

    const center = map.getCenter();
    dispatch(setMapView({
      center: [center.lat, center.lng],
      zoom: map.getZoom()
    }));
  }
};

const buildMapView = (ref: React.RefObject<ForecastMapHandle | null>) => {
  const map = ref.current?.getMap();
  const center = map?.getCenter();
  return {
    center: (center ? [center.lat, center.lng] : [39.8283, -98.5795]) as [number, number],
    zoom: map?.getZoom() || 4
  };
};

export const ForecastPage: React.FC = () => {
  const dispatch = useDispatch();
  const { addToast } = useOutletContext<PageContext>();
  const mapRef = useRef<ForecastMapHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  const forecastCycle = useSelector(selectForecastCycle);
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const emergencyMode = useSelector((state: RootState) => state.forecast.emergencyMode);
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);

  // Hooks
  useAutoCategorical();
  useAutoSave();
  useCycleHistoryPersistence();

  // Initialize feature flags
  useEffect(() => {
    const anyEnabled = isAnyOutlookEnabled(featureFlags);
    dispatch(setEmergencyMode(!anyEnabled));
    const firstEnabled = getFirstEnabledOutlookType(featureFlags);
    dispatch(setActiveOutlookType(firstEnabled as OutlookType));
  }, [dispatch, featureFlags]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('forecastData');
      if (savedData) {
        const data = JSON.parse(savedData);
        if (validateForecastData(data)) {
          const deserializedCycle = deserializeForecast(data);
          dispatch(importForecastCycle(deserializedCycle));
          if (data.mapView) {
            dispatch(setMapView(data.mapView));
          }
          addToast('Session restored from auto-save.', 'success');
        }
      }
    } catch (error) {
      console.error('Error auto-loading:', error);
    }
  }, [dispatch, addToast]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSaved) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
      }
      return undefined;
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaved]);

  // Save handler
  const handleSave = useCallback(() => {
    try {
      exportForecastToJson(forecastCycle, buildMapView(mapRef));
      dispatch(markAsSaved());
      addToast('Forecast exported to JSON!', 'success');
    } catch (error) {
      console.error('Error exporting forecast:', error);
      addToast('Error exporting forecast.', 'error');
    }
  }, [forecastCycle, dispatch, addToast]);

  // Load handler
  const handleLoad = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        addToast('File is not valid JSON.', 'error');
        return;
      }
      
      if (!validateForecastData(data)) {
        addToast('Invalid forecast data format.', 'error');
        return;
      }

      const deserializedCycle = deserializeForecast(data);
      dispatch(importForecastCycle(deserializedCycle));
      
      const map = mapRef.current?.getMap();
      const dataObj = data as { mapView?: { center: [number, number]; zoom: number } };
      const currentDayData = deserializedCycle.days[deserializedCycle.currentDay]?.data;
      
      if (dataObj.mapView) {
        dispatch(setMapView(dataObj.mapView));
      } else if (map && currentDayData) {
        fitMapToFeatures(map, currentDayData, dispatch);
      }
      
      addToast('Forecast loaded successfully!', 'success');
    } catch (error) {
      console.error('Error loading file:', error);
      addToast('Error reading file.', 'error');
    }
  }, [dispatch, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const { activeOutlookType, activeProbability, isSignificant } = drawingState;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            if (!isSaved) handleSave();
            return;
          case 'o':
          case 'l':
            e.preventDefault();
            fileInputRef.current?.click();
            return;
          case 'e':
            e.preventDefault();
            mapRef.current?.getMap(); // Trigger export via useExportMap
            return;
        }
      }

      // Skip if any modifier keys for other shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const key = e.key.toLowerCase();

      // Day number shortcuts (1-8)
      if (/^[1-8]$/.test(key)) {
        const day = parseInt(key, 10) as DayType;
        if (forecastCycle.currentDay !== day) {
          dispatch(setForecastDay(day));
          addToast(`Switched to Day ${day}`, 'info');
        }
        return;
      }

      // Type switching
      switch (key) {
        case 't':
          if (activeOutlookType !== 'tornado') {
            dispatch(setActiveOutlookType('tornado'));
            addToast('Switched to Tornado outlook', 'info');
          }
          break;
        case 'w':
          if (activeOutlookType !== 'wind') {
            dispatch(setActiveOutlookType('wind'));
            addToast('Switched to Wind outlook', 'info');
          }
          break;
        case 'h':
          if (activeOutlookType !== 'hail') {
            dispatch(setActiveOutlookType('hail'));
            addToast('Switched to Hail outlook', 'info');
          }
          break;
        case 'c':
          if (activeOutlookType !== 'categorical') {
            dispatch(setActiveOutlookType('categorical'));
            addToast('Switched to Categorical outlook', 'info');
          }
          break;
        case 'g':
          if (activeOutlookType === 'categorical') {
            dispatch(setActiveProbability('TSTM'));
            addToast('Added General Thunderstorm risk', 'info');
          }
          break;
        case 's':
          const canToggle = activeOutlookType !== 'categorical' &&
            (activeOutlookType === 'tornado' 
              ? !['2%', '5%'].includes(activeProbability)
              : !['5%'].includes(activeProbability));
          if (canToggle) {
            dispatch(toggleSignificant());
            addToast(`${isSignificant ? 'Disabled' : 'Enabled'} significant threat`, 'info');
          }
          break;
      }

      // Arrow keys for probability navigation
      if (['arrowup', 'arrowright', 'arrowdown', 'arrowleft'].includes(key)) {
        const probabilities = getProbabilityList(activeOutlookType);
        const currentIndex = probabilities.indexOf(activeProbability.replace('#', '%'));
        const isUp = key === 'arrowup' || key === 'arrowright';

        if (isUp && currentIndex < probabilities.length - 1) {
          const nextProb = probabilities[currentIndex + 1];
          dispatch(setActiveProbability(nextProb as Probability));
          addToast(`Increased to ${nextProb}`, 'info');
        } else if (!isUp && currentIndex > 0) {
          const prevProb = probabilities[currentIndex - 1];
          dispatch(setActiveProbability(prevProb as Probability));
          addToast(`Decreased to ${prevProb}`, 'info');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, isSaved, drawingState, handleSave, addToast, forecastCycle.currentDay]);

  if (emergencyMode) {
    return <EmergencyModeMessage />;
  }

  return (
    <div className="relative h-full w-full">
      {/* Full-screen map - extends to integrated toolbar */}
      <div className="absolute inset-x-0 top-0 bottom-[200px] z-0">
        <ForecastMap ref={mapRef} />
      </div>

      {/* Hidden file input for keyboard shortcuts */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleLoad(file);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Integrated Bottom Toolbar */}
      <IntegratedToolbar
        onSave={handleSave}
        onLoad={handleLoad}
        mapRef={mapRef}
        addToast={addToast}
      />
    </div>
  );
};

export default ForecastPage;
