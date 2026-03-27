import React, { useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { RootState } from '../store';
import { selectForecastCycle, setForecastDay, resetForecasts, importForecastCycle } from '../store/forecastSlice';
import CycleHistoryModal from '../components/CycleManager/CycleHistoryModal';
import ConfirmationModal from '../components/DrawingTools/ConfirmationModal';
import type { AddToastFn } from '../components/Layout';

import { computeHomeStats, formatCycleDate } from './homeUtils';
import { createFileHandlers } from '../hooks/useFileLoader';
import HomeHero from './home/HomeHero';
import Dashboard from './home/Dashboard';
import MainGrid from './home/MainGrid';
import RecentCycles from './home/RecentCycles';
import { DayType } from '../types/outlooks';

interface PageContext {
  addToast: AddToastFn;
}

/** AI development disclosure banner shown at the bottom of the home page. */
const AIDisclosure: React.FC = () => (
  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
    <Bot className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/70" />
    <p className="leading-relaxed">
      <span className="font-medium text-foreground">AI Development Disclosure:</span>{' '}
      AI was used in the development of this project. All code has been reviewed by the maintainer
      (Alex / WeatherboySuper) to ensure quality and correctness; however, bugs or issues may still
      be present. If you encounter a problem, please report it via{' '}
      <a href="https://github.com/WxboySuper/Graphical-Forecast-Creator/issues" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">GitHub Issues</a>
      {' '}or the{' '}
      <a href="https://discord.gg/SGk37rg8sz" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">GFC Support Discord</a>.
    </p>
  </div>
);

/** Main home page component showing the hero, dashboard stats, forecast grid, recent cycles, and AI disclosure. */
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { addToast } = useOutletContext<PageContext>();
  const forecastCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector((state: RootState) => state.forecast.savedCycles);
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [confirmNewCycle, setConfirmNewCycle] = useState(false);

  const { fileInputRef, handleFileSelect, handleOpenFilePicker, handleSave: doSave } = createFileHandlers({ addToast, dispatch, forecastCycle });

  const stats = useMemo(() => computeHomeStats(forecastCycle, savedCycles.length), [forecastCycle, savedCycles.length]);

  /** Resets the forecast cycle, prompting for confirmation if there are unsaved changes. */
  const handleNewCycle = () => {
    if (!isSaved) {
      setConfirmNewCycle(true);
      return;
    }
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
  };

  /** Switches to the given day and navigates to the forecast page. */
  const handleQuickStart = (day: DayType) => {
    dispatch(setForecastDay(day));
    navigate('/forecast');
  };

  /** Triggers a save of the current forecast cycle to JSON. */
  const handleSave = () => doSave();

  /** Navigates to the forecast map page. */
  const handleNavigateForecast = () => navigate('/forecast');

  /** Navigates to the discussion editor page. */
  const handleNavigateDiscussion = () => navigate('/discussion');

  /** Navigates to the account page for hosted sign-in and sync settings. */
  const handleNavigateAccount = () => navigate('/account');

  /** Opens the OS file picker to load a forecast cycle from a JSON file. */
  const openFilePicker = () => handleOpenFilePicker();

  /** Opens the cycle history modal. */
  const handleOpenHistoryModal = () => setShowHistoryModal(true);

  /** Closes the cycle history modal. */
  const handleCloseHistoryModal = () => setShowHistoryModal(false);

  /** Extracts the day from the button's data attribute and starts forecast editing for that day. */
  const handleQuickStartClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(e.currentTarget.dataset.day);
    if (Number.isNaN(day)) return;
    handleQuickStart(day as DayType);
  };

  /** Loads a recent saved cycle from the history by its ID stored on the button's data attribute. */
  const handleLoadRecentCycleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const cycleId = e.currentTarget.dataset.cycleId;
    if (!cycleId) return;
    const cycle = savedCycles.find((item) => item.id === cycleId);
    if (!cycle) return;
    dispatch(importForecastCycle(cycle.forecastCycle));
    addToast('Cycle loaded from history', 'success');
  };

  /** Confirms starting a new cycle after the user acknowledges unsaved changes will be lost. */
  const handleConfirmNewCycle = () => {
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
    setConfirmNewCycle(false);
  };

  /** Cancels the new cycle confirmation dialog without discarding the current cycle. */
  const handleCancelNewCycle = () => setConfirmNewCycle(false);

  const formattedDate = useMemo(() => formatCycleDate(forecastCycle.cycleDate), [forecastCycle.cycleDate]);

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto p-8 space-y-10">
        <HomeHero onStart={handleNavigateForecast} onWriteDiscussion={handleNavigateDiscussion} onViewAccount={handleNavigateAccount} />
        <Dashboard stats={stats} />
        <MainGrid
          formattedDate={formattedDate}
          isSaved={isSaved}
          forecastCycle={forecastCycle}
          stats={stats}
          onQuickStartClick={handleQuickStartClick}
          onNavigateForecast={handleNavigateForecast}
          onNavigateDiscussion={handleNavigateDiscussion}
          onNewCycle={handleNewCycle}
          onSave={handleSave}
          onOpenFile={openFilePicker}
          onOpenHistory={handleOpenHistoryModal}
        />

        <RecentCycles savedCycles={savedCycles} onLoad={handleLoadRecentCycleClick} onOpenHistory={handleOpenHistoryModal} />

        <AIDisclosure />
      </div>

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />

      <CycleHistoryModal isOpen={showHistoryModal} onClose={handleCloseHistoryModal} />
      <ConfirmationModal isOpen={confirmNewCycle} title="Start New Cycle" message="You have unsaved changes. Start a new cycle anyway?" onConfirm={handleConfirmNewCycle} onCancel={handleCancelNewCycle} confirmLabel="Start New Cycle" />
    </div>
  );
};

export default HomePage;
export { HomePage };
