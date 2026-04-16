import React, { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { selectCanRedo, selectCanUndo, selectForecastCycle } from '../../store/forecastSlice';
import { setBaseMapStyle, setGhostOutlookVisibility } from '../../store/overlaysSlice';
import type { BaseMapStyle } from '../../store/overlaysSlice';
import { ForecastMapHandle } from '../Map/ForecastMap';
import type { AddToastFn } from '../Layout';
import useOutlookPanelLogic from '../OutlookPanel/useOutlookPanelLogic';
import { useExportMap } from '../DrawingTools/useExportMap';

import { DayType, OutlookType } from '../../types/outlooks';
import { getOutlookColor } from '../../utils/outlookUtils';

const OUTLOOK_TYPE_ORDER: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'];

import { useForecastWorkspaceActionHandlers } from './forecastWorkspaceActions';

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

/* Action handlers moved to forecastWorkspaceActions.tsx */

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
