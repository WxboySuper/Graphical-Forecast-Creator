import React from 'react';
import CycleHistoryModal from '../components/CycleManager/CycleHistoryModal';
import ConfirmationModal from '../components/DrawingTools/ConfirmationModal';
import HomeHero, { HeroSummaryCard } from './home/HomeHero';
import Dashboard from './home/Dashboard';
import MainGrid from './home/MainGrid';
import RecentCycles from './home/RecentCycles';
import './HomePage.css';
import useHomePageLogic from './home/useHomePageLogic';
import AIDisclosure from './home/AIDisclosure';

type HomeLogic = ReturnType<typeof useHomePageLogic>;

type HomeSectionProps = Pick<
  HomeLogic,
  | 'variant'
  | 'stats'
  | 'formattedDate'
  | 'savedCycles'
  | 'forecastCycle'
  | 'isSaved'
  | 'handleNavigateForecast'
  | 'handleNavigateDiscussion'
  | 'handleNavigateAccount'
  | 'handleOpenHistoryModal'
  | 'handleQuickStartClick'
  | 'handleNewCycle'
  | 'handleSave'
  | 'openFilePicker'
  | 'handleLoadRecentCycleClick'
>;

/** Signed-in layout (extracted to reduce HomePage function length) */
const HomeSignedInSection: React.FC<HomeSectionProps> = ({
  variant,
  stats,
  formattedDate,
  savedCycles,
  forecastCycle,
  isSaved,
  handleNavigateForecast,
  handleNavigateDiscussion,
  handleNavigateAccount,
  handleOpenHistoryModal,
  handleQuickStartClick,
  handleNewCycle,
  handleSave,
  openFilePicker,
  handleLoadRecentCycleClick,
}) => (
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
);

/** Signed-out layout (extracted to reduce HomePage function length) */
const HomeSignedOutSection: React.FC<HomeSectionProps> = ({
  variant,
  stats,
  formattedDate,
  savedCycles,
  forecastCycle,
  isSaved,
  handleNavigateForecast,
  handleNavigateDiscussion,
  handleNavigateAccount,
  handleOpenHistoryModal,
  handleQuickStartClick,
  handleNewCycle,
  handleSave,
  openFilePicker,
  handleLoadRecentCycleClick,
}) => (
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
);


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
          <HomeSignedInSection
            variant={variant}
            stats={stats}
            formattedDate={formattedDate}
            savedCycles={savedCycles}
            forecastCycle={forecastCycle}
            isSaved={isSaved}
            handleNavigateForecast={handleNavigateForecast}
            handleNavigateDiscussion={handleNavigateDiscussion}
            handleNavigateAccount={handleNavigateAccount}
            handleOpenHistoryModal={handleOpenHistoryModal}
            handleQuickStartClick={handleQuickStartClick}
            handleNewCycle={handleNewCycle}
            handleSave={handleSave}
            openFilePicker={openFilePicker}
            handleLoadRecentCycleClick={handleLoadRecentCycleClick}
          />
        ) : (
          <HomeSignedOutSection
            variant={variant}
            stats={stats}
            formattedDate={formattedDate}
            savedCycles={savedCycles}
            forecastCycle={forecastCycle}
            isSaved={isSaved}
            handleNavigateForecast={handleNavigateForecast}
            handleNavigateDiscussion={handleNavigateDiscussion}
            handleNavigateAccount={handleNavigateAccount}
            handleOpenHistoryModal={handleOpenHistoryModal}
            handleQuickStartClick={handleQuickStartClick}
            handleNewCycle={handleNewCycle}
            handleSave={handleSave}
            openFilePicker={openFilePicker}
            handleLoadRecentCycleClick={handleLoadRecentCycleClick}
          />
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
