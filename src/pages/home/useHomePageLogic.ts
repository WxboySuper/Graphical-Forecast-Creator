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

  const handleNewCycle = () => {
    if (!isSaved) {
      setConfirmNewCycle(true);
      return;
    }
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
  };

  const handleQuickStart = (day: DayType) => {
    dispatch(setForecastDay(day));
    navigate('/forecast');
  };

  const handleSave = () => doSave();

  const handleNavigateForecast = () => navigate('/forecast');
  const handleNavigateDiscussion = () => navigate('/discussion');
  const handleNavigateAccount = () => navigate('/account');
  const openFilePicker = () => handleOpenFilePicker();

  const handleOpenHistoryModal = () => setShowHistoryModal(true);
  const handleCloseHistoryModal = () => setShowHistoryModal(false);

  const handleQuickStartClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(e.currentTarget.dataset.day);
    if (Number.isNaN(day)) {
      return;
    }
    handleQuickStart(day as DayType);
  };

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

  const handleConfirmNewCycle = () => {
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
    setConfirmNewCycle(false);
  };

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
