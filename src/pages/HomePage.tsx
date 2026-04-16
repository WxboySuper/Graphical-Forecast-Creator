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

import useHomePageLogic from './home/useHomePageLogic';
import AIDisclosure from './home/AIDisclosure';

interface PageContext {
  addToast: AddToastFn;
}


/** Main home page with auth-aware landing variants and a workflow-first forecast layout. */
const HomePage: React.FC = () => {
  const {
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
  } = useHomePageLogic();

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
