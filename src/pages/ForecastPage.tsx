import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import type { Dispatch, UnknownAction } from 'redux';
import { ForecastMapHandle } from '../components/Map/ForecastMap';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { RootState } from '../store';
import { 
  importForecastCycle, 
  markAsSaved, 
  resetForecasts,
  saveCurrentCycle,
  setMapView,
  setActiveOutlookType,
  setActiveProbability,
  toggleSignificant,
  setEmergencyMode,
  selectForecastCycle,
  selectCanRedo,
  selectCanUndo,
  setForecastDay,
  redoLastEdit,
  undoLastEdit,
} from '../store/forecastSlice';
import { OutlookType, Probability, DayType, GFCForecastSaveData } from '../types/outlooks';
import { deserializeForecast, validateForecastData, exportForecastToJson, serializeForecast } from '../utils/fileUtils';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from '../utils/featureFlagsUtils';
import { useAutoSave } from '../hooks/useAutoSave';
import { useCycleHistoryPersistence } from '../utils/cycleHistoryPersistence';
import useAutoCategorical from '../hooks/useAutoCategorical';
import type { AddToastFn } from '../components/Layout';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { useCloudCycles, type UseCloudCyclesResult } from '../hooks/useCloudCycles';
import { useCloudSync } from '../hooks/useCloudSync';
import { CloudToolbarButton } from '../components/CloudCycleManager/CloudToolbarButton';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { getLocalCalendarDate } from '../utils/localDate';
import { queueProductMetric } from '../utils/productMetrics';
import { ForecastTabbedToolbarLayout } from '../components/ForecastWorkspace/ForecastWorkspaceLayouts';
import ForecastWorkspaceModals from '../components/ForecastWorkspace/ForecastWorkspaceModals';
import { useForecastWorkspaceController } from '../components/ForecastWorkspace/useForecastWorkspaceController';
import {
  readStoredForecastUiVariant,
  resolveForecastUiVariant,
  type ForecastUiVariant,
} from '../utils/forecastUiVariant';

interface PageContext {
  addToast: AddToastFn;
}

const renderForecastWorkspaceLayout = (
  variant: ForecastUiVariant,
  props: {
    mapRef: React.RefObject<ForecastMapHandle | null>;
    controller: ReturnType<typeof useForecastWorkspaceController>;
  }
) => {
  // Only the Tabbed Toolbar variant is supported now.
  return <ForecastTabbedToolbarLayout {...props} />;
};

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

interface DayRolloverPromptState {
  previousDay: string;
  currentDay: string;
}

const DAY_ROLLOVER_LAST_ACTIVE_KEY = 'gfc-last-active-local-day';
const DAY_ROLLOVER_PROMPTED_KEY = 'gfc-day-rollover-prompt-day';
const DAY_ROLLOVER_CHECK_INTERVAL_MS = 60_000;

/** Reads one stored day string from localStorage, returning null when storage is unavailable. */
const readStoredDayValue = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Persists one day string into localStorage, ignoring storage errors. */
const writeStoredDayValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures so the editor keeps functioning.
  }
};

/** Returns true when the forecast cycle contains any drawable outlook data or saved low-probability state. */
const hasRolloverForecastData = (
  forecastCycle: ReturnType<typeof selectForecastCycle>
): boolean => countForecastMetrics(forecastCycle).forecastDays > 0;

/** Returns true when any forecast day already has discussion content attached. */
const cycleHasDiscussionContent = (
  forecastCycle: ReturnType<typeof selectForecastCycle>
): boolean => Object.values(forecastCycle.days).some((dayData) => Boolean(dayData?.discussion));

/** Returns true when the current session has unsaved work worth saving during a day rollover. */
const hasUnsavedRolloverCandidateSession = (
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  isSaved: boolean
): boolean => {
  if (isSaved) {
    return false;
  }

  return hasRolloverForecastData(forecastCycle) || cycleHasDiscussionContent(forecastCycle);
};

/** Builds a short Cycle History label for one rollover save action. */
const buildRolloverSaveLabel = (cycleDate: string): string => {
  const parsedDate = new Date(`${cycleDate}T00:00:00`);
  const labelDate = Number.isNaN(parsedDate.getTime())
    ? cycleDate
    : parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Rollover save • ${labelDate}`;
};

/** Formats a stored YYYY-MM-DD value into a more readable date label for the dialog copy. */
const formatRolloverDayLabel = (value: string): string => {
  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

/** Modal prompt shown when the editor detects the local day rolled over while an older session still has work. */
const DayRolloverDialog: React.FC<{
  promptState: DayRolloverPromptState | null;
  onKeepCurrentSession: () => void;
  onSaveAndStartNewDay: () => void;
}> = ({
  promptState,
  onKeepCurrentSession,
  onSaveAndStartNewDay,
}) => (
  <Dialog open={Boolean(promptState)} onOpenChange={(isOpen) => { if (!isOpen) onKeepCurrentSession(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New day detected</DialogTitle>
        <DialogDescription>
          {promptState ? (
            <>
              It looks like your current Forecast session is from {formatRolloverDayLabel(promptState.previousDay)} and today is{' '}
              {formatRolloverDayLabel(promptState.currentDay)}. Do you want to save that session to Cycle History and start a
              fresh forecast for today?
            </>
          ) : null}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button variant="outline" onClick={onKeepCurrentSession}>
          Keep Current Session
        </Button>
        <Button onClick={onSaveAndStartNewDay}>
          Save Session &amp; Start New Day
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/** Reads the current map view (center + zoom) from the map adapter; returns defaults if no adapter is mounted. */
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

interface StoredCloudMeta {
  id?: string;
  label?: string;
}

const CLOUD_CYCLE_PAYLOAD_KEY = 'cloudCyclePayload';
const CLOUD_CYCLE_META_KEY = 'cloudCycleMeta';

/** Reads and validates a forecast JSON file, returning the parsed payload or null on failure. */
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

/** Returns true if the given day data object contains at least one outlook map with features. */
const dayHasAnyFeatures = (dayData: unknown): boolean => {
  if (!dayData || typeof dayData !== 'object') return false;

  const maps = Object.values(dayData as Record<string, { size?: number } | undefined>);
  return maps.some((outlookMap) => (outlookMap?.size ?? 0) > 0);
};

/** Dispatches the loaded forecast to Redux and updates the map view, auto-restoring center/zoom when available. */
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

/** Returns a memoized callback that serializes the current forecast cycle to JSON and marks the store as saved. */
const useForecastSaveAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user']
) => {
  return useCallback(() => {
    try {
      exportForecastToJson(forecastCycle, buildMapView(mapRef));
      dispatch(markAsSaved());
      queueProductMetric({ event: 'cycle_saved', user });
      addToast('Forecast exported to JSON!', 'success');
    } catch {
      addToast('Error exporting forecast.', 'error');
    }
  }, [forecastCycle, dispatch, addToast, mapRef, user]);
};

/** Returns a memoized async callback that parses and imports a forecast JSON file into Redux. */
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

const ARROW_KEYS = new Set(['arrowup', 'arrowright', 'arrowdown', 'arrowleft']);
const INCREASE_PROBABILITY_KEYS = new Set(['arrowup', 'arrowright']);
const MODIFIER_KEYS: Array<keyof Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'];
type ShortcutDispatch = Dispatch<UnknownAction>;

interface KeyboardShortcutContext {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
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

/** Returns true if the event target is an input or textarea that should receive keyboard text. */
const isTypingTarget = (target: EventTarget | null): boolean => {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
};

/** Normalises a probability string by converting legacy `#` suffix to `%` (e.g. `"10#"` → `"10%"`). */
const normalizeProbability = (value: string): string => value.replace('#', '%');

/** Returns true if the current outlook type and probability support toggling the significant-threat flag. */
const canToggleSignificantForState = (
  activeOutlookType: OutlookType,
  activeProbability: string
): boolean => {
  if (activeOutlookType === 'categorical') return false;
  if (activeOutlookType === 'tornado') return !['2%', '5%'].includes(activeProbability);
  return activeProbability !== '5%';
};

/** Returns true if any Ctrl / Meta / Alt / Shift modifier key is held during the event. */
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

/** Type-guard that narrows a key string to the set of recognised Ctrl/Cmd shortcut keys. */
const isCommandShortcutKey = (key: string): key is CommandShortcutKey => {
  return key === 's' || key === 'o' || key === 'l' || key === 'e';
};

type UndoRedoAction = 'undo' | 'redo' | null;

/** Resolves whether the current modifier/key combination should undo, redo, or do nothing. */
const getUndoRedoAction = (e: KeyboardEvent, key: string): UndoRedoAction => {
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (key === 'y') return 'redo';
  if (key !== 'z') return null;
  return e.shiftKey ? 'redo' : 'undo';
};

/** Dispatches an undo/redo action only when that action is currently available in history. */
const dispatchUndoRedoAction = (
  action: Exclude<UndoRedoAction, null>,
  context: KeyboardShortcutContext
) => {
  if (action === 'undo') {
    if (context.canUndo) {
      context.dispatch(undoLastEdit());
    }
    return;
  }

  if (context.canRedo) {
    context.dispatch(redoLastEdit());
  }
};

/** Handles the app-level undo/redo shortcuts before browser defaults can consume them. */
const handleUndoRedoShortcuts = (
  e: KeyboardEvent,
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  const action = getUndoRedoAction(e, key);
  if (!action) return false;

  e.preventDefault();
  dispatchUndoRedoAction(action, context);
  return true;
};

/** Handles Ctrl/Cmd shortcut keys (save, open, load, export); returns true if the key was handled. */
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

/** Switches the active forecast day when a digit key 1–8 is pressed; returns true if handled. */
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

/** Switches to a specific outlook type when its letter shortcut (t/w/h/c) is pressed; returns true if handled. */
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

/** Sets the active probability to TSTM when `g` is pressed in categorical mode; returns true if handled. */
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

/** Toggles the significant-threat flag when `s` is pressed (without Ctrl); returns true if handled. */
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

/** Computes the next probability step from an arrow-key press; returns the step or null if at a boundary. */
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

/** Handles arrow-key presses to step the active probability up or down; returns true if handled. */
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

/** Dispatches the first matching standard shortcut handler (day, outlook type, TSTM, significant, arrow keys). */
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

/** Central keydown router: runs command shortcuts first, then standard shortcuts, skipping typing targets. */
const processShortcutKeyDown = (
  e: KeyboardEvent,
  context: KeyboardShortcutContext
) => {
  const key = e.key.toLowerCase();
  if (isTypingTarget(e.target)) return;

  if (handleUndoRedoShortcuts(e, key, context)) return;
  if (handleCommandShortcuts(e, key, context)) return;
  if (hasAnyModifierKey(e)) return;

  handleStandardShortcuts(key, context);
};

/** Syncs the Redux active outlook type and emergency mode whenever feature flags change. */
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

/** Reads and validates one stored forecast payload string from browser storage. */
const parseStoredForecastPayload = (storedValue: string | null): GFCForecastSaveData | null => {
  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as unknown;
    return validateForecastData(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Applies one stored forecast payload into Redux and restores the saved map view when present. */
const restoreStoredForecastPayload = (
  data: GFCForecastSaveData,
  dispatch: ShortcutDispatch
) => {
  const deserializedCycle = deserializeForecast(data);
  dispatch(importForecastCycle(deserializedCycle));

  const rawData = data as LoadedForecastPayload['rawData'];
  if (rawData.mapView) {
    dispatch(setMapView(rawData.mapView));
  }
};

/** Reads the stored cloud-cycle metadata payload when it exists and is well-formed. */
const parseStoredCloudMeta = (storedValue: string | null): StoredCloudMeta | null => {
  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as StoredCloudMeta;
  } catch {
    return null;
  }
};

/** Clears the temporary session-storage keys used for handing a cloud cycle into the editor. */
const clearStoredCloudSession = () => {
  sessionStorage.removeItem(CLOUD_CYCLE_PAYLOAD_KEY);
  sessionStorage.removeItem(CLOUD_CYCLE_META_KEY);
};

/** Returns true when stored cloud metadata includes the id and label needed to restore selection context. */
const hasRestorableCloudSelection = (
  cloudMeta: StoredCloudMeta | null
): cloudMeta is Required<Pick<StoredCloudMeta, 'id' | 'label'>> => Boolean(cloudMeta?.id && cloudMeta.label);

/** Notifies the forecast page about the cloud cycle that was just restored when metadata is complete. */
const restoreCloudSelectionContext = (
  cloudMeta: StoredCloudMeta | null,
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void
) => {
  if (!onCloudCycleLoaded || !hasRestorableCloudSelection(cloudMeta)) {
    return;
  }

  onCloudCycleLoaded({ id: cloudMeta.id, label: cloudMeta.label });
};

/** Restores a cloud-loaded forecast from session storage when one is waiting to be opened. */
const restoreCloudSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void
): boolean => {
  const cloudPayloadStr = sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY);
  const data = parseStoredForecastPayload(cloudPayloadStr);
  if (!data) {
    return false;
  }

  const cloudMeta = parseStoredCloudMeta(sessionStorage.getItem(CLOUD_CYCLE_META_KEY));

  restoreStoredForecastPayload(data, dispatch);
  restoreCloudSelectionContext(cloudMeta, onCloudCycleLoaded);
  clearStoredCloudSession();
  addToast('Cloud forecast loaded successfully.', 'success');
  return true;
};

/** Restores the last local auto-saved forecast when no cloud-loaded payload is pending. */
const restoreLocalSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn
): void => {
  const data = parseStoredForecastPayload(localStorage.getItem('forecastData'));
  if (!data) {
    return;
  }

  restoreStoredForecastPayload(data, dispatch);
  addToast('Session restored from auto-save.', 'success');
};

/** Restores a pending cloud session first, then falls back to the local auto-save snapshot. */
const restoreAvailableSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void
) => {
  const restoredCloudSession = restoreCloudSession(dispatch, addToast, onCloudCycleLoaded);
  if (restoredCloudSession) {
    return;
  }

  restoreLocalSession(dispatch, addToast);
};

/** Attempts to restore the last auto-saved forecast session from localStorage on mount. */
const useSessionRestore = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void
) => {
  const onCloudCycleLoadedRef = useRef(onCloudCycleLoaded);
  const [restoreComplete, setRestoreComplete] = useState(false);

  useEffect(() => {
    onCloudCycleLoadedRef.current = onCloudCycleLoaded;
  }, [onCloudCycleLoaded]);

  useEffect(() => {
    try {
      restoreAvailableSession(dispatch, addToast, onCloudCycleLoadedRef.current);
    } catch {
      // Silently skip auto-load errors to avoid disrupting initial render
    } finally {
      setRestoreComplete(true);
    }
  }, [dispatch, addToast]);

  return restoreComplete;
};

/** Registers a beforeunload listener to warn the user when the forecast has unsaved changes. */
const useUnsavedChangesWarning = (isSaved: boolean) => {
  useEffect(() => {
    /** Shows the browser's native leave-confirmation dialog when there are unsaved changes. */
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

/** Returns the stored/derived day-rollover snapshot needed to decide whether a prompt should be shown. */
const getDayRolloverSnapshot = () => {
  const today = getLocalCalendarDate();
  const lastActiveDay = readStoredDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY);
  const alreadyPromptedToday = readStoredDayValue(DAY_ROLLOVER_PROMPTED_KEY) === today;

  writeStoredDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY, today);

  return {
    today,
    lastActiveDay,
    alreadyPromptedToday,
  };
};

/** Returns true when the day-rollover modal should not be shown for the current snapshot. */
export const shouldSkipDayRolloverPrompt = ({
  restoreComplete,
  lastActiveDay,
  today,
  alreadyPromptedToday,
  promptOpen,
  hasUnsavedWork,
}: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  hasUnsavedWork: boolean;
}) => {
  if (!restoreComplete) {
    return true;
  }

  if (!lastActiveDay || lastActiveDay === today) {
    return true;
  }

  if (alreadyPromptedToday || promptOpen) {
    return true;
  }

  return !hasUnsavedWork;
};

/** Saves the previous cycle when needed, resets the editor, and returns whether a history save occurred. */
export const getDayRolloverPromptState = ({
  restoreComplete,
  lastActiveDay,
  today,
  alreadyPromptedToday,
  promptOpen,
  forecastCycle,
  isSaved,
}: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
}): DayRolloverPromptState | null => {
  const hasUnsavedWork = hasUnsavedRolloverCandidateSession(forecastCycle, isSaved);

  if (shouldSkipDayRolloverPrompt({
    restoreComplete,
    lastActiveDay,
    today,
    alreadyPromptedToday,
    promptOpen,
    hasUnsavedWork,
  })) {
    return null;
  }

  return {
    previousDay: lastActiveDay as string,
    currentDay: today,
  };
};

/** Saves the current session to Cycle History when needed, then resets the editor for the new local day. */
export const runDayRolloverSaveAction = ({
  forecastCycle,
  isSaved,
  dispatch,
}: {
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
  dispatch: ShortcutDispatch;
}): boolean => {
  const didSaveSession = hasUnsavedRolloverCandidateSession(forecastCycle, isSaved);

  if (didSaveSession) {
    dispatch(saveCurrentCycle({ label: buildRolloverSaveLabel(forecastCycle.cycleDate) }));
  }

  dispatch(resetForecasts());
  return didSaveSession;
};

/** Watches for a local calendar-day rollover and offers to save the previous session before starting a new one. */
const useDayRolloverPrompt = ({
  restoreComplete,
  dispatch,
  addToast,
  forecastCycle,
  isSaved,
}: {
  restoreComplete: boolean;
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
}) => {
  const [promptState, setPromptState] = useState<DayRolloverPromptState | null>(null);
  const forecastCycleRef = useRef(forecastCycle);
  const isSavedRef = useRef(isSaved);
  const promptStateRef = useRef(promptState);

  useEffect(() => {
    forecastCycleRef.current = forecastCycle;
  }, [forecastCycle]);

  useEffect(() => {
    isSavedRef.current = isSaved;
  }, [isSaved]);

  useEffect(() => {
    promptStateRef.current = promptState;
  }, [promptState]);

  const detectDayRollover = useCallback(() => {
    const { today, lastActiveDay, alreadyPromptedToday } = getDayRolloverSnapshot();
    const nextPromptState = getDayRolloverPromptState({
      restoreComplete,
      lastActiveDay,
      today,
      alreadyPromptedToday,
      promptOpen: Boolean(promptStateRef.current),
      forecastCycle: forecastCycleRef.current,
      isSaved: isSavedRef.current,
    });

    if (!nextPromptState) {
      return;
    }

    writeStoredDayValue(DAY_ROLLOVER_PROMPTED_KEY, today);
    setPromptState(nextPromptState);
  }, [restoreComplete]);

  useEffect(() => {
    detectDayRollover();

    /** Re-checks the local day when the tab regains focus so midnight rollovers are caught quickly. */
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        detectDayRollover();
      }
    };

    const intervalId = window.setInterval(detectDayRollover, DAY_ROLLOVER_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [detectDayRollover]);

  useEffect(() => {
    if (!restoreComplete) {
      return;
    }

    writeStoredDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY, getLocalCalendarDate());
  }, [restoreComplete]);

  const handleKeepCurrentSession = useCallback(() => {
    setPromptState(null);
  }, []);

  const handleSaveAndStartNewDay = useCallback(() => {
    const didSaveSession = runDayRolloverSaveAction({
      forecastCycle,
      isSaved,
      dispatch,
    });

    addToast(
      didSaveSession
        ? 'Saved the previous session to Cycle History and started a new forecast for today.'
        : 'Started a new forecast for today.',
      'success'
    );
    setPromptState(null);
  }, [addToast, dispatch, forecastCycle, isSaved]);

  return {
    promptState,
    handleKeepCurrentSession,
    handleSaveAndStartNewDay,
  };
};

/** Composes save, load, and file-input-change callbacks into a single hook return. */
const useForecastFileActions = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user']
) => {
  const handleSave = useForecastSaveAction(dispatch, addToast, forecastCycle, mapRef, user);
  const handleLoad = useForecastLoadAction(dispatch, addToast, mapRef);

  return { handleSave, handleLoad };
};

interface KeyboardShortcutHookParams {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  drawingState: RootState['forecast']['drawingState'];
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  handleSave: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  currentDay: DayType;
}

/** Registers a keydown listener that processes all forecast keyboard shortcuts for the current context. */
const useKeyboardShortcuts = ({
  dispatch,
  addToast,
  drawingState,
  isSaved,
  canUndo,
  canRedo,
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
      canUndo,
      canRedo,
      handleSave,
      fileInputRef,
      mapRef,
      currentDay,
      activeOutlookType,
      activeProbability,
      isSignificant,
    };

    /** Processes each keydown event through the shortcut pipeline. */
    const handleKeyDown = (e: KeyboardEvent) => processShortcutKeyDown(e, shortcutContext);

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, addToast, drawingState, isSaved, canUndo, canRedo, handleSave, fileInputRef, mapRef, currentDay]);
};

/** Returns the cloud-cycle restore callback and cloud-save action used by the forecast toolbar. */
const useCloudForecastActions = ({
  addToast,
  currentMapView,
  forecastCycle,
  markAsCurrent,
  markCurrentStateSynced,
  saveCycle,
  userId,
}: {
  addToast: AddToastFn;
  currentMapView: RootState['forecast']['currentMapView'];
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  markAsCurrent: UseCloudCyclesResult['markAsCurrent'];
  markCurrentStateSynced: () => void;
  saveCycle: UseCloudCyclesResult['saveCycle'];
  userId: string | undefined;
}) => {
  const handleCloudCycleLoaded = useCallback(
    (cloudCycle: { id: string; label: string }) => {
      markAsCurrent(cloudCycle.id, cloudCycle.label);
      markCurrentStateSynced();
    },
    [markAsCurrent, markCurrentStateSynced]
  );

  const handleSaveToCloud = useCallback(
    async (label: string) => {
      if (!userId) {
        throw new Error('Sign in to save forecasts to the cloud.');
      }

      const payload = serializeForecast(forecastCycle, currentMapView);
      const stats = countForecastMetrics(forecastCycle);
      const success = await saveCycle(label, forecastCycle.cycleDate, stats, payload);

      if (!success) {
        throw new Error('Unable to save this forecast to the cloud right now.');
      }

      markCurrentStateSynced();
      addToast(`Saved "${label}" to the cloud.`, 'success');
    },
    [addToast, currentMapView, forecastCycle, markCurrentStateSynced, saveCycle, userId]
  );

  return {
    handleCloudCycleLoaded,
    handleSaveToCloud,
  };
};

/** Creates the cloud toolbar node so the page body stays focused on layout. */
const renderCloudToolbar = ({
  premiumActive,
  isExpiredPremium,
  forecastCycle,
  currentCloud,
  onSaveToCloud,
  onOpenCloudLibrary,
}: {
  premiumActive: boolean;
  isExpiredPremium: boolean;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  currentCloud: UseCloudCyclesResult['currentCloud'];
  onSaveToCloud: (label: string) => Promise<void>;
  onOpenCloudLibrary: () => void;
}) => (
  <CloudToolbarButton
    canSave={premiumActive}
    premiumActive={premiumActive}
    isExpiredPremium={isExpiredPremium}
    currentCycleDate={forecastCycle.cycleDate}
    currentCloudLabel={currentCloud?.label}
    syncState={currentCloud?.syncState}
    onSaveToCloud={onSaveToCloud}
    onOpenCloudLibrary={onOpenCloudLibrary}
  />
);

/** Composes the forecast page's cloud, file, and shortcut hooks into a single workspace model. */
const useForecastPageWorkspace = ({
  dispatch,
  addToast,
  navigate,
  mapRef,
  fileInputRef,
}: {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  navigate: ReturnType<typeof useNavigate>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) => {
  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  const forecastCycle = useSelector(selectForecastCycle);
  const currentMapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const emergencyMode = useSelector((state: RootState) => state.forecast.emergencyMode);
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const { user } = useAuth();
  const { premiumActive, effectiveSource } = useEntitlement();
  const cloudCycles = useCloudCycles();
  const { currentCloud, saveCycle, markAsCurrent } = cloudCycles;
  const cloudSync = useCloudSync(cloudCycles);
  const { markCurrentStateSynced } = cloudSync;
  const isExpiredPremium = !premiumActive && effectiveSource === 'stripe';

  useAutoCategorical();
  useAutoSave();
  useCycleHistoryPersistence();
  useFeatureFlagSync(dispatch, featureFlags);

  const { handleCloudCycleLoaded, handleSaveToCloud } = useCloudForecastActions({
    addToast,
    currentMapView,
    forecastCycle,
    markAsCurrent,
    markCurrentStateSynced,
    saveCycle,
    userId: user?.uid,
  });

  const restoreComplete = useSessionRestore(dispatch, addToast, handleCloudCycleLoaded);
  useUnsavedChangesWarning(isSaved);

  const { handleSave, handleLoad } = useForecastFileActions(
    dispatch,
    addToast,
    forecastCycle,
    mapRef,
    user
  );

  useKeyboardShortcuts({
    dispatch,
    addToast,
    drawingState,
    isSaved,
    canUndo,
    canRedo,
    handleSave,
    fileInputRef,
    mapRef,
    currentDay: forecastCycle.currentDay,
  });

  const dayRolloverPrompt = useDayRolloverPrompt({
    restoreComplete,
    dispatch,
    addToast,
    forecastCycle,
    isSaved,
  });

  const workspaceController = useForecastWorkspaceController({
    onSave: handleSave,
    onLoad: handleLoad,
    mapRef,
    fileInputRef,
    addToast,
    cloudTools: renderCloudToolbar({
      premiumActive,
      isExpiredPremium,
      forecastCycle,
      currentCloud,
      onSaveToCloud: handleSaveToCloud,
      onOpenCloudLibrary: () => navigate('/cloud'),
    }),
  });

  return {
    emergencyMode,
    dayRolloverPrompt,
    workspaceController,
  };
};

/** Root forecast page: mounts the full-screen map with the integrated toolbar and wires all hooks. */
export const ForecastPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useOutletContext<PageContext>();
  const { syncedSettings } = useAuth();
  const mapRef = useRef<ForecastMapHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    emergencyMode,
    dayRolloverPrompt,
    workspaceController,
  } = useForecastPageWorkspace({
    dispatch,
    addToast,
    navigate,
    mapRef,
    fileInputRef,
  });

  if (emergencyMode) {
    return <EmergencyModeMessage />;
  }

  const forecastUiVariant = resolveForecastUiVariant({
    search: location.search,
    syncedSettingValue: syncedSettings?.forecastUiVariant,
    storageValue: readStoredForecastUiVariant(),
  });

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: 'calc(100dvh - var(--app-header-height, 64px))' }}
    >
      {renderForecastWorkspaceLayout(forecastUiVariant, {
        mapRef,
        controller: workspaceController,
      })}
      <ForecastWorkspaceModals controller={workspaceController} />
      <DayRolloverDialog
        promptState={dayRolloverPrompt.promptState}
        onKeepCurrentSession={dayRolloverPrompt.handleKeepCurrentSession}
        onSaveAndStartNewDay={dayRolloverPrompt.handleSaveAndStartNewDay}
      />
    </div>
  );
};

export default ForecastPage;
