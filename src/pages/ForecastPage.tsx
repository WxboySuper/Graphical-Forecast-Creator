import React, { useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import type { Dispatch, UnknownAction } from 'redux';
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
import { OutlookType, Probability, DayType } from '../types/outlooks';
import { deserializeForecast, validateForecastData, exportForecastToJson } from '../utils/fileUtils';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from '../utils/featureFlagsUtils';
import { useAutoSave } from '../hooks/useAutoSave';
import { useCycleHistoryPersistence } from '../utils/cycleHistoryPersistence';
import useAutoCategorical from '../hooks/useAutoCategorical';
import type { AddToastFn } from '../components/Layout';

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

const buildMapView = (ref: React.RefObject<ForecastMapHandle | null>) => {
  const adapter = ref.current;
  if (!adapter) {
    return {
      center: [39.8283, -98.5795] as [number, number],
      zoom: 4
    };
  }

  return adapter.getView();
};

interface LoadedForecastPayload {
  rawData: { mapView?: { center: [number, number]; zoom: number } };
  deserializedCycle: ReturnType<typeof deserializeForecast>;
}

const parseLoadedForecast = async (
  file: File,
  addToast: AddToastFn
): Promise<LoadedForecastPayload | null> => {
  const text = await file.text();
  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    addToast('File is not valid JSON.', 'error');
    return null;
  }

  if (!validateForecastData(data)) {
    addToast('Invalid forecast data format.', 'error');
    return null;
  }

  return {
    rawData: data as LoadedForecastPayload['rawData'],
    deserializedCycle: deserializeForecast(data),
  };
};

const dayHasAnyFeatures = (dayData: unknown): boolean => {
  if (!dayData || typeof dayData !== 'object') return false;

  const maps = Object.values(dayData as Record<string, { size?: number } | undefined>);
  return maps.some((outlookMap) => (outlookMap?.size ?? 0) > 0);
};

const applyLoadedForecast = (
  payload: LoadedForecastPayload,
  dispatch: ShortcutDispatch,
  mapRef: React.RefObject<ForecastMapHandle | null>
) => {
  dispatch(importForecastCycle(payload.deserializedCycle));

  if (payload.rawData.mapView) {
    dispatch(setMapView(payload.rawData.mapView));
    return;
  }

  const map = mapRef.current?.getMap();
  if (!map) return;

  const currentDayData = payload.deserializedCycle.days[payload.deserializedCycle.currentDay]?.data;
  if (dayHasAnyFeatures(currentDayData)) {
    dispatch(setMapView({
      center: [39.8283, -98.5795],
      zoom: 4
    }));
  }
};

const useForecastSaveAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>
) => {
  return useCallback(() => {
    try {
      exportForecastToJson(forecastCycle, buildMapView(mapRef));
      dispatch(markAsSaved());
      addToast('Forecast exported to JSON!', 'success');
    } catch {
      addToast('Error exporting forecast.', 'error');
    }
  }, [forecastCycle, dispatch, addToast, mapRef]);
};

const useForecastLoadAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  mapRef: React.RefObject<ForecastMapHandle | null>
) => {
  return useCallback(async (file: File) => {
    try {
      const payload = await parseLoadedForecast(file, addToast);
      if (!payload) return;

      applyLoadedForecast(payload, dispatch, mapRef);
      addToast('Forecast loaded successfully!', 'success');
    } catch {
      addToast('Error reading file.', 'error');
    }
  }, [dispatch, addToast, mapRef]);
};

const useShortcutFileInputChange = (handleLoad: (file: File) => Promise<void>) => {
  return useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleLoad(file);
    }
    e.target.value = '';
  }, [handleLoad]);
};

const ARROW_KEYS = new Set(['arrowup', 'arrowright', 'arrowdown', 'arrowleft']);
const INCREASE_PROBABILITY_KEYS = new Set(['arrowup', 'arrowright']);
const MODIFIER_KEYS: Array<keyof Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'];
type ShortcutDispatch = Dispatch<UnknownAction>;

interface KeyboardShortcutContext {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  isSaved: boolean;
  handleSave: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  currentDay: DayType;
  activeOutlookType: OutlookType;
  activeProbability: string;
  isSignificant: boolean;
}

type CommandShortcutKey = 's' | 'o' | 'l' | 'e';
type CommandShortcutHandler = (context: KeyboardShortcutContext) => void;

const OUTLOOK_SHORTCUTS: Record<string, { type: OutlookType; label: string }> = {
  t: { type: 'tornado', label: 'Tornado' },
  w: { type: 'wind', label: 'Wind' },
  h: { type: 'hail', label: 'Hail' },
  c: { type: 'categorical', label: 'Categorical' },
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
};

const normalizeProbability = (value: string): string => value.replace('#', '%');

const canToggleSignificantForState = (
  activeOutlookType: OutlookType,
  activeProbability: string
): boolean => {
  if (activeOutlookType === 'categorical') return false;
  if (activeOutlookType === 'tornado') return !['2%', '5%'].includes(activeProbability);
  return activeProbability !== '5%';
};

const hasAnyModifierKey = (e: KeyboardEvent): boolean => {
  return MODIFIER_KEYS.some((modifier) => e[modifier]);
};

const COMMAND_SHORTCUT_HANDLERS: Record<CommandShortcutKey, CommandShortcutHandler> = {
  s: (context) => {
    if (!context.isSaved) {
      context.handleSave();
    }
  },
  o: (context) => {
    context.fileInputRef.current?.click();
  },
  l: (context) => {
    context.fileInputRef.current?.click();
  },
  e: (context) => {
    context.mapRef.current?.getMap();
  },
};

const isCommandShortcutKey = (key: string): key is CommandShortcutKey => {
  return key === 's' || key === 'o' || key === 'l' || key === 'e';
};

const handleCommandShortcuts = (
  e: KeyboardEvent,
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (!(e.ctrlKey || e.metaKey)) return false;
  if (!isCommandShortcutKey(key)) return false;

  const runShortcut = COMMAND_SHORTCUT_HANDLERS[key];
  e.preventDefault();
  runShortcut(context);
  return true;
};

const handleDayShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (!/^[1-8]$/.test(key)) return false;

  const day = parseInt(key, 10) as DayType;
  if (context.currentDay !== day) {
    context.dispatch(setForecastDay(day));
    context.addToast(`Switched to Day ${day}`, 'info');
  }
  return true;
};

const handleOutlookShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  const shortcut = OUTLOOK_SHORTCUTS[key];
  if (!shortcut) return false;

  if (context.activeOutlookType !== shortcut.type) {
    context.dispatch(setActiveOutlookType(shortcut.type));
    context.addToast(`Switched to ${shortcut.label} outlook`, 'info');
  }
  return true;
};

const handleGeneralThunderstormShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (key !== 'g') return false;

  if (context.activeOutlookType === 'categorical') {
    context.dispatch(setActiveProbability('TSTM'));
    context.addToast('Added General Thunderstorm risk', 'info');
  }
  return true;
};

const handleSignificantShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (key !== 's') return false;

  if (!canToggleSignificantForState(context.activeOutlookType, context.activeProbability)) return true;

  let threatStateLabel = 'Enabled';
  if (context.isSignificant) {
    threatStateLabel = 'Disabled';
  }

  context.dispatch(toggleSignificant());
  context.addToast(`${threatStateLabel} significant threat`, 'info');
  return true;
};

const getArrowProbabilityStep = (
  key: string,
  context: KeyboardShortcutContext
): { nextProbability: string; directionLabel: 'Increased' | 'Decreased' } | null => {
  const probabilities = getProbabilityList(context.activeOutlookType);
  const currentIndex = probabilities.indexOf(normalizeProbability(context.activeProbability));
  if (currentIndex === -1) return null;

  const isUp = INCREASE_PROBABILITY_KEYS.has(key);
  const nextProbability = probabilities[isUp ? currentIndex + 1 : currentIndex - 1];
  if (!nextProbability) return null;

  return {
    nextProbability,
    directionLabel: isUp ? 'Increased' : 'Decreased'
  };
};

const handleArrowProbabilityShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (!ARROW_KEYS.has(key)) return false;

  const step = getArrowProbabilityStep(key, context);
  if (!step) return true;

  context.dispatch(setActiveProbability(step.nextProbability as Probability));
  context.addToast(`${step.directionLabel} to ${step.nextProbability}`, 'info');
  return true;
};

const handleStandardShortcuts = (
  key: string,
  context: KeyboardShortcutContext
) => {
  const shortCircuitHandlers: Array<(shortcutKey: string, shortcutContext: KeyboardShortcutContext) => boolean> = [
    handleDayShortcut,
    handleOutlookShortcut,
    handleGeneralThunderstormShortcut,
    handleSignificantShortcut,
  ];

  const wasHandled = shortCircuitHandlers.some((handler) => handler(key, context));
  if (!wasHandled) {
    handleArrowProbabilityShortcut(key, context);
  }
};

const processShortcutKeyDown = (
  e: KeyboardEvent,
  context: KeyboardShortcutContext
) => {
  const key = e.key.toLowerCase();
  if (isTypingTarget(e.target)) return;

  if (handleCommandShortcuts(e, key, context)) return;
  if (hasAnyModifierKey(e)) return;

  handleStandardShortcuts(key, context);
};

const useFeatureFlagSync = (
  dispatch: ShortcutDispatch,
  featureFlags: RootState['featureFlags']
) => {
  useEffect(() => {
    const anyEnabled = isAnyOutlookEnabled(featureFlags);
    dispatch(setEmergencyMode(!anyEnabled));
    const firstEnabled = getFirstEnabledOutlookType(featureFlags);
    dispatch(setActiveOutlookType(firstEnabled as OutlookType));
  }, [dispatch, featureFlags]);
};

const useSessionRestore = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn
) => {
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('forecastData');
      if (!savedData) return;

      const data = JSON.parse(savedData);
      if (!validateForecastData(data)) return;

      const deserializedCycle = deserializeForecast(data);
      dispatch(importForecastCycle(deserializedCycle));
      if (data.mapView) {
        dispatch(setMapView(data.mapView));
      }
      addToast('Session restored from auto-save.', 'success');
    } catch {
      // Silently skip auto-load errors to avoid disrupting initial render
    }
  }, [dispatch, addToast]);
};

const useUnsavedChangesWarning = (isSaved: boolean) => {
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
};

const useForecastFileActions = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>
) => {
  const handleSave = useForecastSaveAction(dispatch, addToast, forecastCycle, mapRef);
  const handleLoad = useForecastLoadAction(dispatch, addToast, mapRef);
  const handleShortcutFileInputChange = useShortcutFileInputChange(handleLoad);

  return { handleSave, handleLoad, handleShortcutFileInputChange };
};

interface KeyboardShortcutHookParams {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  drawingState: RootState['forecast']['drawingState'];
  isSaved: boolean;
  handleSave: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  currentDay: DayType;
}

const useKeyboardShortcuts = ({
  dispatch,
  addToast,
  drawingState,
  isSaved,
  handleSave,
  fileInputRef,
  mapRef,
  currentDay,
}: KeyboardShortcutHookParams) => {
  useEffect(() => {
    const { activeOutlookType, activeProbability, isSignificant } = drawingState;
    const shortcutContext: KeyboardShortcutContext = {
      dispatch,
      addToast,
      isSaved,
      handleSave,
      fileInputRef,
      mapRef,
      currentDay,
      activeOutlookType,
      activeProbability,
      isSignificant,
    };

    const handleKeyDown = (e: KeyboardEvent) => processShortcutKeyDown(e, shortcutContext);

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, addToast, drawingState, isSaved, handleSave, fileInputRef, mapRef, currentDay]);
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

  useFeatureFlagSync(dispatch, featureFlags);
  useSessionRestore(dispatch, addToast);
  useUnsavedChangesWarning(isSaved);

  const { handleSave, handleLoad, handleShortcutFileInputChange } = useForecastFileActions(
    dispatch,
    addToast,
    forecastCycle,
    mapRef
  );

  useKeyboardShortcuts({
    dispatch,
    addToast,
    drawingState,
    isSaved,
    handleSave,
    fileInputRef,
    mapRef,
    currentDay: forecastCycle.currentDay,
  });

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
        onChange={handleShortcutFileInputChange}
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
