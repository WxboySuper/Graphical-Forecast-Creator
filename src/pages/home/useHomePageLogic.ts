import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { AddToastFn } from '../../components/Layout';
import { RootState } from '../../store';
import { selectForecastCycle, setForecastDay, resetForecasts, importForecastCycle } from '../../store/forecastSlice';
import { DayType } from '../../types/outlooks';
import { computeHomeStats, formatCycleDate } from '../homeUtils';
import { createFileHandlers } from '../../hooks/useFileLoader';
import { useAuth } from '../../auth/AuthProvider';

/**
 * Encapsulates the state and handlers used by the HomePage component so the page
 * component remains a focused presentational layer. This reduces HomePage's
 * function length for static analysis tools.
 */
const useHomePageLogic = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { addToast } = useOutletContext<{ addToast: AddToastFn }>();
  const { hostedAuthEnabled, status } = useAuth();
  const forecastCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector((state: RootState) => state.forecast.savedCycles);
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [confirmNewCycle, setConfirmNewCycle] = useState(false);

  const { fileInputRef, handleFileSelect, handleOpenFilePicker, handleSave: doSave } = createFileHandlers({
    addToast,
    dispatch,
    forecastCycle,
  });

  const stats = useMemo(() => computeHomeStats(forecastCycle, savedCycles), [forecastCycle, savedCycles]);
  const formattedDate = useMemo(() => formatCycleDate(forecastCycle.cycleDate), [forecastCycle.cycleDate]);
  const variant = hostedAuthEnabled && status === 'signed_in' ? 'signed_in' : 'signed_out';

  /** Start a new forecast cycle; prompts if there are unsaved changes. */
  const handleNewCycle = () => {
    if (!isSaved) {
      setConfirmNewCycle(true);
      return;
    }
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
  };

  /** Quickly navigate to the forecast editor for the given day. */
  const handleQuickStart = (day: DayType) => {
    dispatch(setForecastDay(day));
    navigate('/forecast');
  };

  /** Save the current forecast cycle to storage. */
  const handleSave = () => doSave();

  /** Navigate to the forecast page. */
  const handleNavigateForecast = () => navigate('/forecast');
  /** Navigate to the discussion page. */
  const handleNavigateDiscussion = () => navigate('/discussion');
  /** Navigate to the account page. */
  const handleNavigateAccount = () => navigate('/account');
  /** Open the file picker for cycle import. */
  const openFilePicker = () => handleOpenFilePicker();

  /** Show the cycle history modal. */
  const handleOpenHistoryModal = () => setShowHistoryModal(true);
  /** Hide the cycle history modal. */
  const handleCloseHistoryModal = () => setShowHistoryModal(false);

  /** Handle quick-start button clicks from the UI. */
  const handleQuickStartClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(e.currentTarget.dataset.day);
    if (Number.isNaN(day)) {
      return;
    }
    handleQuickStart(day as DayType);
  };

  /** Load a recent cycle from the saved cycles list. */
  const handleLoadRecentCycleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const cycleId = e.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    const cycle = savedCycles.find((item) => item.id === cycleId);
    if (!cycle) {
      return;
    }

    dispatch(importForecastCycle(cycle.forecastCycle));
    addToast('Cycle loaded from history', 'success');
  };

  /** Confirm starting a new cycle (discard changes). */
  const handleConfirmNewCycle = () => {
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
    setConfirmNewCycle(false);
  };

  /** Cancel the 'start new cycle' confirmation. */
  const handleCancelNewCycle = () => setConfirmNewCycle(false);

  return {
    variant,
    stats,
    formattedDate,
    fileInputRef,
    handleFileSelect,
    handleOpenFilePicker,
    handleSave,
    handleNavigateForecast,
    handleNavigateDiscussion,
    handleNavigateAccount,
    openFilePicker,
    showHistoryModal,
    confirmNewCycle,
    handleOpenHistoryModal,
    handleCloseHistoryModal,
    handleQuickStartClick,
    handleLoadRecentCycleClick,
    handleConfirmNewCycle,
    handleCancelNewCycle,
    handleNewCycle,
    savedCycles,
    forecastCycle,
    isSaved,
  } as const;
};

export default useHomePageLogic;
