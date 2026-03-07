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

  const openFilePicker = () => handleOpenFilePicker();

  const handleOpenHistoryModal = () => setShowHistoryModal(true);
  const handleCloseHistoryModal = () => setShowHistoryModal(false);

  const handleQuickStartClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(e.currentTarget.dataset.day);
    if (Number.isNaN(day)) return;
    handleQuickStart(day as DayType);
  };

  const handleLoadRecentCycleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const cycleId = e.currentTarget.dataset.cycleId;
    if (!cycleId) return;
    const cycle = savedCycles.find((item) => item.id === cycleId);
    if (!cycle) return;
    dispatch(importForecastCycle(cycle.forecastCycle));
    addToast('Cycle loaded from history', 'success');
  };

  const handleConfirmNewCycle = () => {
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
    setConfirmNewCycle(false);
  };

  const handleCancelNewCycle = () => setConfirmNewCycle(false);

  const formattedDate = useMemo(() => formatCycleDate(forecastCycle.cycleDate), [forecastCycle.cycleDate]);

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto p-8 space-y-10">
        <HomeHero onStart={handleNavigateForecast} onWriteDiscussion={handleNavigateDiscussion} />
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
      </div>

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />

      <CycleHistoryModal isOpen={showHistoryModal} onClose={handleCloseHistoryModal} />
      <ConfirmationModal isOpen={confirmNewCycle} title="Start New Cycle" message="You have unsaved changes. Start a new cycle anyway?" onConfirm={handleConfirmNewCycle} onCancel={handleCancelNewCycle} confirmLabel="Start New Cycle" />
    </div>
  );
};

export default HomePage;
export { HomePage };
