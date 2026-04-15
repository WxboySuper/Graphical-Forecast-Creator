import React, { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  redoLastEdit,
  resetForecasts,
  selectCanRedo,
  selectCanUndo,
  selectForecastCycle,
  setCycleDate,
  setForecastDay,
  toggleLowProbability,
  undoLastEdit,
} from '../../store/forecastSlice';
import { setBaseMapStyle, setGhostOutlookVisibility } from '../../store/overlaysSlice';
import type { BaseMapStyle } from '../../store/overlaysSlice';
import { ForecastMapHandle } from '../Map/ForecastMap';
import type { AddToastFn } from '../Layout';
import useOutlookPanelLogic from '../OutlookPanel/useOutlookPanelLogic';
import { useExportMap } from '../DrawingTools/useExportMap';
import { downloadGfcPackage } from '../../utils/fileUtils';
import { DayType, OutlookType } from '../../types/outlooks';
import { getOutlookColor } from '../../utils/outlookUtils';

const OUTLOOK_TYPE_ORDER: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'];

interface ForecastWorkspaceActionParams {
  dispatch: ReturnType<typeof useDispatch>;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  currentDay: DayType;
  canUndo: boolean;
  canRedo: boolean;
  tempDate: string;
  setIsEditingDate: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPackageDownloading: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleCancelReset: () => void;
}

export interface ForecastWorkspaceController {
  onSave: () => void;
  onLoadClick: () => void;
  onPackageDownload: () => void;
  onOpenHistoryModal: () => void;
  onOpenCopyModal: () => void;
  onOpenResetConfirm: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDateSave: () => void;
  onTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartDateEdit: () => void;
  onDayButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToggleLowProbability: () => void;
  onCloseHistoryModal: () => void;
  onCloseCopyModal: () => void;
  onCancelReset: () => void;
  onReset: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isExporting: boolean;
  isExportModalOpen: boolean;
  onInitiateExport: () => void;
  onConfirmExport: (title: string) => Promise<void>;
  onCancelExport: () => void;
  isPackageDownloading: boolean;
  showHistoryModal: boolean;
  showCopyModal: boolean;
  showResetConfirm: boolean;
  isEditingDate: boolean;
  tempDate: string;
  cycleDate: string;
  currentDay: DayType;
  days: ReturnType<typeof selectForecastCycle>['days'];
  availableTypes: OutlookType[];
  ghostTypes: OutlookType[];
  activeOutlookType: OutlookType;
  activeProbability: string;
  isSignificant: boolean;
  significantThreatsEnabled: boolean;
  lowProbabilityOutlooks: OutlookType[];
  visibleGhostOutlooks: OutlookType[];
  ghostVisibility: Record<OutlookType, boolean>;
  outlookTypeHandlers: Record<OutlookType, () => void>;
  ghostOutlookHandlers: Partial<Record<OutlookType, () => void>>;
  probabilities: string[];
  probabilityHandlers: Record<string, () => void>;
  currentColor: string;
  isLowProb: boolean;
  cloudTools: React.ReactNode;
  baseMapStyle: BaseMapStyle;
  onBaseMapStyleSelect: (style: BaseMapStyle) => void;
}

interface UseForecastWorkspaceControllerOptions {
  onSave: () => void;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  addToast: AddToastFn;
  cloudTools?: React.ReactNode;
}

/** Returns the selected file from a file input change event, or null when none was chosen. */
const getSelectedFile = (e: React.ChangeEvent<HTMLInputElement>): File | null => {
  return e.target.files?.[0] ?? null;
};

/** Returns the neighboring forecast day in the requested direction, or null at the ends. */
const getAdjacentDay = (currentDay: DayType, offset: -1 | 1): DayType | null => {
  const nextDay = currentDay + offset;
  if (nextDay < 1 || nextDay > 8) return null;
  return nextDay as DayType;
};

/** Parses the day button's data attribute into a DayType, or null when invalid. */
const getClickedDay = (e: React.MouseEvent<HTMLButtonElement>): DayType | null => {
  const day = Number(e.currentTarget.dataset.day);
  return Number.isNaN(day) ? null : day as DayType;
};

/** Dispatches an action creator only when the corresponding history state allows it. */
const dispatchHistoryAction = (
  dispatch: ReturnType<typeof useDispatch>,
  isAvailable: boolean,
  actionCreator: typeof undoLastEdit | typeof redoLastEdit
) => {
  if (isAvailable) {
    dispatch(actionCreator());
  }
};

/** Constructs all event-handler callbacks for workspace actions. */
const useForecastWorkspaceActionHandlers = ({
  dispatch,
  onLoad,
  mapRef,
  addToast,
  forecastCycle,
  currentDay,
  canUndo,
  canRedo,
  tempDate,
  setIsEditingDate,
  setIsPackageDownloading,
  fileInputRef,
  handleCancelReset,
}: ForecastWorkspaceActionParams) => {
  const handlePackageDownload = useCallback(async () => {
    setIsPackageDownloading(true);
    try {
      const mapView = mapRef.current?.getView() ?? { center: [39.8283, -98.5795] as [number, number], zoom: 4 };
      await downloadGfcPackage(forecastCycle, mapView);
      addToast('Package downloaded!', 'success');
    } catch {
      addToast('Failed to create package.', 'error');
    } finally {
      setIsPackageDownloading(false);
    }
  }, [mapRef, forecastCycle, addToast, setIsPackageDownloading]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = getSelectedFile(e);
    if (file) {
      onLoad(file);
    }
    e.target.value = '';
  }, [onLoad]);

  const handleLoadClick = useCallback(() => fileInputRef.current?.click(), [fileInputRef]);

  const handleReset = useCallback(() => {
    dispatch(resetForecasts());
    handleCancelReset();
    addToast('All drawings reset', 'info');
  }, [dispatch, addToast, handleCancelReset]);

  const handleDayChange = useCallback((day: DayType) => dispatch(setForecastDay(day)), [dispatch]);

  const handlePrevDay = useCallback(() => {
    const previousDay = getAdjacentDay(currentDay, -1);
    if (previousDay) {
      dispatch(setForecastDay(previousDay));
    }
  }, [dispatch, currentDay]);

  const handleNextDay = useCallback(() => {
    const nextDay = getAdjacentDay(currentDay, 1);
    if (nextDay) {
      dispatch(setForecastDay(nextDay));
    }
  }, [dispatch, currentDay]);

  const handleDateSave = useCallback(() => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  }, [dispatch, tempDate, setIsEditingDate]);

  const handleDayButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const day = getClickedDay(e);
    if (day) {
      handleDayChange(day);
    }
  }, [handleDayChange]);

  const handleToggleLowProbability = useCallback(() => dispatch(toggleLowProbability()), [dispatch]);
  const handleUndo = useCallback(() => dispatchHistoryAction(dispatch, canUndo, undoLastEdit), [canUndo, dispatch]);
  const handleRedo = useCallback(() => dispatchHistoryAction(dispatch, canRedo, redoLastEdit), [canRedo, dispatch]);

  return {
    onUndo: handleUndo,
    onRedo: handleRedo,
    onLoadClick: handleLoadClick,
    onPackageDownload: () => { void handlePackageDownload(); },
    onDateSave: handleDateSave,
    onDayButtonClick: handleDayButtonClick,
    onPrevDay: handlePrevDay,
    onNextDay: handleNextDay,
    onToggleLowProbability: handleToggleLowProbability,
    onReset: handleReset,
    onFileSelect: handleFileSelect,
  };
};

/** Shared controller for all Forecast workspace layouts. */
export const useForecastWorkspaceController = ({
  onSave,
  onLoad,
  mapRef,
  fileInputRef,
  addToast,
  cloudTools = null,
}: UseForecastWorkspaceControllerOptions): ForecastWorkspaceController => {
  const dispatch = useDispatch();
  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days, cycleDate } = forecastCycle;
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const ghostOutlookState = useSelector((state: RootState) => state.overlays.ghostOutlooks);
  const baseMapStyle = useSelector((state: RootState) => state.overlays.baseMapStyle);
  const lowProbabilityOutlooks = useSelector((state: RootState) =>
    state.forecast.forecastCycle.days[currentDay]?.metadata?.lowProbabilityOutlooks || []
  );
  const outlooks = useSelector((state: RootState) =>
    state.forecast.forecastCycle.days[currentDay]?.data || {}
  );
  const isExportDisabled = useSelector((state: RootState) => state.featureFlags.exportMapEnabled === false);
  const panel = useOutlookPanelLogic();
  const { isExporting, isModalOpen, initiateExport, confirmExport, cancelExport } = useExportMap({
    mapRef,
    outlooks,
    isExportDisabled,
    addToast,
  });

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isPackageDownloading, setIsPackageDownloading] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState('');

  const availableTypes = OUTLOOK_TYPE_ORDER.filter((type) => panel.getOutlookTypeEnabled(type));
  const ghostTypes = availableTypes.filter((type) => type !== panel.activeOutlookType);
  const ghostOutlookHandlers = useMemo(() => {
    const handlers: Partial<Record<OutlookType, () => void>> = {};
    OUTLOOK_TYPE_ORDER.forEach((type) => {
      const nextVisibility = !ghostOutlookState[type];
      handlers[type] = () => dispatch(setGhostOutlookVisibility({ outlookType: type, visible: nextVisibility }));
    });
    return handlers;
  }, [dispatch, ghostOutlookState]);
  const currentColor = useMemo(
    () => getOutlookColor(panel.activeOutlookType, panel.activeProbability),
    [panel.activeOutlookType, panel.activeProbability]
  );
  const isLowProb = lowProbabilityOutlooks.includes(panel.activeOutlookType);
  const visibleGhostOutlooks = availableTypes.filter(
    (type) => type !== panel.activeOutlookType && ghostOutlookState[type]
  );

  const handleOpenHistoryModal = useCallback(() => setShowHistoryModal(true), []);
  const handleOpenCopyModal = useCallback(() => setShowCopyModal(true), []);
  const handleOpenResetConfirm = useCallback(() => setShowResetConfirm(true), []);
  const handleCloseHistoryModal = useCallback(() => setShowHistoryModal(false), []);
  const handleCloseCopyModal = useCallback(() => setShowCopyModal(false), []);
  const handleCancelReset = useCallback(() => setShowResetConfirm(false), []);
  const handleTempDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setTempDate(e.target.value), []);
  const handleStartDateEdit = useCallback(() => {
    setTempDate(cycleDate);
    setIsEditingDate(true);
  }, [cycleDate]);
  const handleBaseMapStyleSelect = useCallback((style: BaseMapStyle) => {
    dispatch(setBaseMapStyle(style));
  }, [dispatch]);

  const handlers = useForecastWorkspaceActionHandlers({
    dispatch,
    onLoad,
    mapRef,
    addToast,
    forecastCycle,
    currentDay,
    canUndo,
    canRedo,
    tempDate,
    setIsEditingDate,
    setIsPackageDownloading,
    fileInputRef,
    handleCancelReset,
  });

  return {
    onSave,
    cloudTools,
    fileInputRef,
    isSaved,
    canUndo,
    canRedo,
    isExporting,
    isExportModalOpen: isModalOpen,
    onInitiateExport: initiateExport,
    onConfirmExport: confirmExport,
    onCancelExport: cancelExport,
    isPackageDownloading,
    showHistoryModal,
    showCopyModal,
    showResetConfirm,
    isEditingDate,
    tempDate,
    cycleDate,
    currentDay,
    days,
    availableTypes,
    ghostTypes,
    activeOutlookType: panel.activeOutlookType,
    activeProbability: panel.activeProbability,
    isSignificant: panel.isSignificant,
    significantThreatsEnabled: panel.significantThreatsEnabled,
    lowProbabilityOutlooks,
    visibleGhostOutlooks,
    ghostVisibility: ghostOutlookState,
    outlookTypeHandlers: panel.outlookTypeHandlers,
    ghostOutlookHandlers,
    probabilities: panel.probabilities,
    probabilityHandlers: panel.probabilityHandlers,
    currentColor,
    isLowProb,
    baseMapStyle,
    onBaseMapStyleSelect: handleBaseMapStyleSelect,
    onOpenHistoryModal: handleOpenHistoryModal,
    onOpenCopyModal: handleOpenCopyModal,
    onOpenResetConfirm: handleOpenResetConfirm,
    onCloseHistoryModal: handleCloseHistoryModal,
    onCloseCopyModal: handleCloseCopyModal,
    onCancelReset: handleCancelReset,
    onTempDateChange: handleTempDateChange,
    onStartDateEdit: handleStartDateEdit,
    ...handlers,
  };
};
