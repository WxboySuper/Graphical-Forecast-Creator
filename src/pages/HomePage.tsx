import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { RootState } from '../store';
import { selectForecastCycle, setForecastDay, resetForecasts, importForecastCycle } from '../store/forecastSlice';
import CycleHistoryModal from '../components/CycleManager/CycleHistoryModal';
import ConfirmationModal from '../components/DrawingTools/ConfirmationModal';
import type { AddToastFn } from '../components/Layout';
import { useAuth } from '../auth/AuthProvider';

import { computeHomeStats, formatCycleDate } from './homeUtils';
import { createFileHandlers } from '../hooks/useFileLoader';
import HomeHero, { HeroSummaryCard, type HomeVariant } from './home/HomeHero';
import Dashboard from './home/Dashboard';
import MainGrid from './home/MainGrid';
import RecentCycles from './home/RecentCycles';
import { DayType } from '../types/outlooks';
import './HomePage.css';

interface PageContext {
  addToast: AddToastFn;
}

/** Maintainer note kept at the bottom of the home page without dominating the product message. */
const AIDisclosure: React.FC = () => (
  <div className="home-disclosure">
    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
    <p className="leading-relaxed">
      <span className="font-medium text-foreground">AI Development Disclosure:</span>{' '}
      AI was used in the development of this project. All code has been reviewed by the maintainer
      (Alex / WeatherboySuper) to ensure quality and correctness; however, bugs or issues may still
      be present. If you encounter a problem, please report it via{' '}
      <a
        href="https://github.com/WxboySuper/Graphical-Forecast-Creator/issues"
        target="_blank"
        rel="noopener noreferrer"
        className="underline transition-colors hover:text-foreground"
      >
        GitHub Issues
      </a>
      {' '}or the{' '}
      <a
        href="https://discord.gg/SGk37rg8sz"
        target="_blank"
        rel="noopener noreferrer"
        className="underline transition-colors hover:text-foreground"
      >
        GFC Support Discord
      </a>
      .
    </p>
  </div>
);

/** Main home page with auth-aware landing variants and a workflow-first forecast layout. */
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { addToast } = useOutletContext<PageContext>();
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
  const variant: HomeVariant = hostedAuthEnabled && status === 'signed_in' ? 'signed_in' : 'signed_out';

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
    if (Number.isNaN(day)) {
      return;
    }
    handleQuickStart(day as DayType);
  };

  /** Loads a recent saved cycle from the history by its ID stored on the button's data attribute. */
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

  /** Confirms starting a new cycle after the user acknowledges unsaved changes will be lost. */
  const handleConfirmNewCycle = () => {
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
    setConfirmNewCycle(false);
  };

  /** Cancels the new cycle confirmation dialog without discarding the current cycle. */
  const handleCancelNewCycle = () => setConfirmNewCycle(false);

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="home-page-shell">
        {variant === 'signed_in' ? (
          <div className="home-signed-in-grid">
            <div className="home-signed-in-main">
              <HomeHero
                variant={variant}
                formattedDate={formattedDate}
                hasSavedCycles={savedCycles.length > 0}
                savedCyclesCount={savedCycles.length}
                showSummaryCard={false}
                onStart={handleNavigateForecast}
                onWriteDiscussion={handleNavigateDiscussion}
                onViewAccount={handleNavigateAccount}
                onOpenHistory={handleOpenHistoryModal}
              />

              <div>
                <MainGrid
                  variant={variant}
                  formattedDate={formattedDate}
                  isSaved={isSaved}
                  forecastCycle={forecastCycle}
                  stats={stats}
                  onQuickStartClick={handleQuickStartClick}
                  onNewCycle={handleNewCycle}
                  onSave={handleSave}
                  onOpenFile={openFilePicker}
                  onOpenHistory={handleOpenHistoryModal}
                />
              </div>
            </div>

            <div className="home-signed-in-side">
              <div className="home-surface-card home-home-summary-rail">
                <HeroSummaryCard
                  variant={variant}
                  formattedDate={formattedDate}
                  savedCyclesCount={savedCycles.length}
                />
              </div>
              <RecentCycles
                variant="compact"
                savedCycles={savedCycles}
                onLoad={handleLoadRecentCycleClick}
                onOpenHistory={handleOpenHistoryModal}
              />
            </div>
          </div>
        ) : (
          <>
            <HomeHero
              variant={variant}
              formattedDate={formattedDate}
              hasSavedCycles={savedCycles.length > 0}
              savedCyclesCount={savedCycles.length}
              onStart={handleNavigateForecast}
              onWriteDiscussion={handleNavigateDiscussion}
              onViewAccount={handleNavigateAccount}
              onOpenHistory={handleOpenHistoryModal}
            />

            <div className="home-primary-grid home-primary-grid-signed-out">
              <div>
                <MainGrid
                  variant={variant}
                  formattedDate={formattedDate}
                  isSaved={isSaved}
                  forecastCycle={forecastCycle}
                  stats={stats}
                  onQuickStartClick={handleQuickStartClick}
                  onNewCycle={handleNewCycle}
                  onSave={handleSave}
                  onOpenFile={openFilePicker}
                  onOpenHistory={handleOpenHistoryModal}
                />
              </div>
              <Dashboard stats={stats} />
            </div>

            <RecentCycles
              variant="section"
              savedCycles={savedCycles}
              onLoad={handleLoadRecentCycleClick}
              onOpenHistory={handleOpenHistoryModal}
            />
          </>
        )}

        <AIDisclosure />
      </div>

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />

      <CycleHistoryModal isOpen={showHistoryModal} onClose={handleCloseHistoryModal} />
      <ConfirmationModal
        isOpen={confirmNewCycle}
        title="Start New Cycle"
        message="You have unsaved changes. Start a new cycle anyway?"
        onConfirm={handleConfirmNewCycle}
        onCancel={handleCancelNewCycle}
        confirmLabel="Start New Cycle"
      />
    </div>
  );
};

export default HomePage;
export { HomePage };
