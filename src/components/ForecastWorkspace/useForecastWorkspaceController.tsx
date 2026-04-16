import React, { useMemo, useState } from 'react';
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

/** Helper to create ghost outlook handlers outside the hook to reduce hook length. */
function createGhostOutlookHandlers(
  dispatch: ReturnType<typeof useDispatch>,
  ghostOutlookState: Record<OutlookType, boolean>
): Partial<Record<OutlookType, () => void>> {
  const handlers: Partial<Record<OutlookType, () => void>> = {};
  OUTLOOK_TYPE_ORDER.forEach((type) => {
    const nextVisibility = !ghostOutlookState[type];
    handlers[type] = () => dispatch(setGhostOutlookVisibility({ outlookType: type, visible: nextVisibility }));
  });
  return handlers;
}

/** Factory for date and modal handlers to keep the hook small and focused. */
function createDateAndModalHandlers(opts: {
  cycleDate: string;
  setShowHistoryModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCopyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowResetConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setTempDate: React.Dispatch<React.SetStateAction<string>>;
  setIsEditingDate: React.Dispatch<React.SetStateAction<boolean>>;
  dispatch: ReturnType<typeof useDispatch>;
}) {
  const { cycleDate, setShowHistoryModal, setShowCopyModal, setShowResetConfirm, setTempDate, setIsEditingDate, dispatch } = opts;
  return {
    handleOpenHistoryModal: () => setShowHistoryModal(true),
    handleOpenCopyModal: () => setShowCopyModal(true),
    handleOpenResetConfirm: () => setShowResetConfirm(true),
    handleCloseHistoryModal: () => setShowHistoryModal(false),
    handleCloseCopyModal: () => setShowCopyModal(false),
    handleCancelReset: () => setShowResetConfirm(false),
    handleTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => setTempDate(e.target.value),
    handleStartDateEdit: () => {
      setTempDate(cycleDate);
      setIsEditingDate(true);
    },
    handleBaseMapStyleSelect: (style: BaseMapStyle) => dispatch(setBaseMapStyle(style)),
  };
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

/* Action handlers moved to forecastWorkspaceActions.tsx */

/** Arguments required to assemble the public ForecastWorkspaceController returned by the hook. */
interface BuildForecastWorkspaceControllerArgs {
  onSave: () => void;
  cloudTools: React.ReactNode;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isExporting: boolean;
  isModalOpen: boolean;
  initiateExport: () => void;
  confirmExport: (title: string) => Promise<void>;
  cancelExport: () => void;
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
  panel: ReturnType<typeof useOutlookPanelLogic>;
  lowProbabilityOutlooks: OutlookType[];
  ghostOutlookState: Record<OutlookType, boolean>;
  ghostOutlookHandlers: Partial<Record<OutlookType, () => void>>;
  currentColor: string;
  isLowProb: boolean;
  baseMapStyle: BaseMapStyle;
  handleBaseMapStyleSelect: (style: BaseMapStyle) => void;
  handleOpenHistoryModal: () => void;
  handleOpenCopyModal: () => void;
  handleOpenResetConfirm: () => void;
  handleCloseHistoryModal: () => void;
  handleCloseCopyModal: () => void;
  handleCancelReset: () => void;
  handleTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleStartDateEdit: () => void;
  handlers: ReturnType<typeof useForecastWorkspaceActionHandlers>;
}

/** Build the controller object returned by useForecastWorkspaceController.
 * Extracted to keep the hook body small for static analysis tools.
 */
function buildForecastWorkspaceController(args: BuildForecastWorkspaceControllerArgs): ForecastWorkspaceController {
  const {
    onSave,
    cloudTools,
    fileInputRef,
    isSaved,
    canUndo,
    canRedo,
    isExporting,
    isModalOpen,
    initiateExport,
    confirmExport,
    cancelExport,
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
    panel,
    lowProbabilityOutlooks,
    ghostOutlookState,
    ghostOutlookHandlers,
    currentColor,
    isLowProb,
    baseMapStyle,
    handleBaseMapStyleSelect,
    handleOpenHistoryModal,
    handleOpenCopyModal,
    handleOpenResetConfirm,
    handleCloseHistoryModal,
    handleCloseCopyModal,
    handleCancelReset,
    handleTempDateChange,
    handleStartDateEdit,
    handlers,
  } = args;

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
    visibleGhostOutlooks: availableTypes.filter((type) => type !== panel.activeOutlookType && ghostOutlookState[type]),
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
}


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
  const ghostOutlookHandlers = useMemo(() => createGhostOutlookHandlers(dispatch, ghostOutlookState), [dispatch, ghostOutlookState]);
  const currentColor = useMemo(
    () => getOutlookColor(panel.activeOutlookType, panel.activeProbability),
    [panel.activeOutlookType, panel.activeProbability]
  );
  const isLowProb = lowProbabilityOutlooks.includes(panel.activeOutlookType);
  const visibleGhostOutlooks = availableTypes.filter(
    (type) => type !== panel.activeOutlookType && ghostOutlookState[type]
  );

  const {
    handleOpenHistoryModal,
    handleOpenCopyModal,
    handleOpenResetConfirm,
    handleCloseHistoryModal,
    handleCloseCopyModal,
    handleCancelReset,
    handleTempDateChange,
    handleStartDateEdit,
    handleBaseMapStyleSelect,
  } = useMemo(
    () =>
      createDateAndModalHandlers({
        cycleDate,
        setShowHistoryModal,
        setShowCopyModal,
        setShowResetConfirm,
        setTempDate,
        setIsEditingDate,
        dispatch,
      }),
    [cycleDate, dispatch]
  );

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

  return buildForecastWorkspaceController({
    onSave,
    cloudTools,
    fileInputRef,
    isSaved,
    canUndo,
    canRedo,
    isExporting,
    isModalOpen,
    initiateExport,
    confirmExport,
    cancelExport,
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
    panel,
    lowProbabilityOutlooks,
    ghostOutlookState,
    ghostOutlookHandlers,
    currentColor,
    isLowProb,
    baseMapStyle,
    handleBaseMapStyleSelect,
    handleOpenHistoryModal,
    handleOpenCopyModal,
    handleOpenResetConfirm,
    handleCloseHistoryModal,
    handleCloseCopyModal,
    handleCancelReset,
    handleTempDateChange,
    handleStartDateEdit,
    handlers,
  });
};
