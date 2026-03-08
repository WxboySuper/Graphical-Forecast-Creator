import React, { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  Tornado, 
  Wind, 
  CloudHail, 
  LayoutGrid,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Save,
  Upload,
  History,
  Copy,
  Image as ImageIcon,
  Archive,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { OutlookType, CategoricalRiskLevel, DayType } from '../../types/outlooks';
import { getCategoricalRiskDisplayName, getOutlookColor } from '../../utils/outlookUtils';
import useOutlookPanelLogic from '../OutlookPanel/useOutlookPanelLogic';
import { cn } from '../../lib/utils';
import { RootState } from '../../store';
import { 
  selectForecastCycle, 
  setForecastDay, 
  setCycleDate,
  resetForecasts,
  toggleLowProbability,
} from '../../store/forecastSlice';
import { ForecastMapHandle } from '../Map/ForecastMap';
import CycleHistoryModal from '../CycleManager/CycleHistoryModal';
import CopyFromPreviousModal from '../CycleManager/CopyFromPreviousModal';
import ExportModal from '../DrawingTools/ExportModal';
import { useExportMap } from '../DrawingTools/useExportMap';
import { downloadGfcPackage } from '../../utils/fileUtils';
import type { AddToastFn } from '../Layout';

const outlookIcons: Record<OutlookType, React.ReactNode> = {
  tornado: <Tornado className="h-4 w-4" />,
  wind: <Wind className="h-4 w-4" />,
  hail: <CloudHail className="h-4 w-4" />,
  categorical: <LayoutGrid className="h-4 w-4" />,
  totalSevere: <CloudHail className="h-4 w-4" />,
  'day4-8': <Calendar className="h-4 w-4" />,
};

const outlookLabels: Record<OutlookType, string> = {
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
  categorical: 'Categorical',
  totalSevere: 'Total Severe',
  'day4-8': 'Day 4-8',
};

const outlookShortcuts: Record<OutlookType, string> = {
  tornado: 'T',
  wind: 'W',
  hail: 'H',
  categorical: 'C',
  totalSevere: 'S',
  'day4-8': 'D',
};

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

interface IntegratedToolbarProps {
  onSave: () => void;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
}

/** Returns true if the given day in the forecast cycle has any outlook polygons drawn for any outlook type. */
const hasDayOutlookData = (
  days: ReturnType<typeof selectForecastCycle>['days'],
  day: DayType
) => {
  const outlookDay = days[day];
  if (!outlookDay) return false;
  const { data } = outlookDay;

  return (
    (data.tornado && data.tornado.size > 0) ||
    (data.wind && data.wind.size > 0) ||
    (data.hail && data.hail.size > 0) ||
    (data.totalSevere && data.totalSevere.size > 0) ||
    (data['day4-8'] && data['day4-8'].size > 0) ||
    (data.categorical && data.categorical.size > 0)
  );
};

interface IntegratedToolbarViewProps {
  onSave: () => void;
  onLoadClick: () => void;
  onPackageDownload: () => void;
  onOpenHistoryModal: () => void;
  onOpenCopyModal: () => void;
  onOpenResetConfirm: () => void;
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
  fileInputRef: React.RefObject<HTMLInputElement>;
  isSaved: boolean;
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
  activeOutlookType: OutlookType;
  activeProbability: string;
  isSignificant: boolean;
  significantThreatsEnabled: boolean;
  lowProbabilityOutlooks: OutlookType[];
  outlookTypeHandlers: Record<OutlookType, () => void>;
  probabilities: string[];
  probabilityHandlers: Record<string, () => void>;
  currentColor: string;
  isLowProb: boolean;
}

/** Toolbar actions panel: Save, Load, Export, Package download, Cycle History, Copy from Previous, and Reset buttons. */
/** Compact icon button wrapped in a Tooltip for use in the integrated toolbar. */
const ToolbarTooltipButton: React.FC<{
  icon: React.ReactNode;
  tooltip: React.ReactNode;
  className: string;
  onClick?: () => void;
  disabled?: boolean;
}> = ({ icon, tooltip, className, onClick, disabled }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="outline" size="icon" className={className} onClick={onClick} disabled={disabled}>
        {icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

/** Save / load / export / package-download and history/copy/reset action buttons for the toolbar. */
const ToolbarToolsSection: React.FC<{
  onSave: () => void;
  onLoadClick: () => void;
  onInitiateExport: () => void;
  onPackageDownload: () => void;
  onOpenHistoryModal: () => void;
  onOpenCopyModal: () => void;
  onOpenResetConfirm: () => void;
  isSaved: boolean;
  isExporting: boolean;
  isPackageDownloading: boolean;
}> = ({ onSave, onLoadClick, onInitiateExport, onPackageDownload, onOpenHistoryModal, onOpenCopyModal, onOpenResetConfirm, isSaved, isExporting, isPackageDownloading }) => (
  <div className="flex flex-col gap-2 lg:gap-3 border-r border-border pr-2 lg:pr-4">
    <div className="flex items-center gap-2">
      <ToolbarTooltipButton
        icon={<Save className="h-6 w-6" />}
        tooltip={<p>Save to JSON <span className="text-muted-foreground">(⌃S)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-green-500/20 hover:bg-green-500/30 border-green-500/50 text-green-700 dark:!bg-green-500/20 dark:hover:!bg-green-500/30 dark:border-green-500/50 dark:text-green-400"
        onClick={onSave}
        disabled={isSaved}
      />
      <ToolbarTooltipButton
        icon={<Upload className="h-6 w-6" />}
        tooltip={<p>Load from JSON <span className="text-muted-foreground">(⌃L)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/50 text-blue-700 dark:!bg-blue-500/20 dark:hover:!bg-blue-500/30 dark:border-blue-500/50 dark:text-blue-400"
        onClick={onLoadClick}
      />
      <ToolbarTooltipButton
        icon={isExporting ? <span className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" /> : <ImageIcon className="h-6 w-6" />}
        tooltip={<p>{isExporting ? 'Exporting...' : 'Export Image'} <span className="text-muted-foreground">(⌃E)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/50 text-orange-700 dark:!bg-orange-500/20 dark:hover:!bg-orange-500/30 dark:border-orange-500/50 dark:text-orange-400"
        onClick={onInitiateExport}
        disabled={isExporting}
      />
      <ToolbarTooltipButton
        icon={<Archive className="h-6 w-6" />}
        tooltip={<p>Download Package <span className="text-muted-foreground">(JSON + Discussions)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-violet-500/20 hover:bg-violet-500/30 border-violet-500/50 text-violet-700 dark:!bg-violet-500/20 dark:hover:!bg-violet-500/30 dark:border-violet-500/50 dark:text-violet-400"
        onClick={onPackageDownload}
        disabled={isPackageDownloading}
      />
    </div>
    <div className="flex items-center gap-2">
      <ToolbarTooltipButton
        icon={<History className="h-6 w-6" />}
        tooltip={<p>Cycle History</p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/50 text-cyan-700 dark:!bg-cyan-500/20 dark:hover:!bg-cyan-500/30 dark:border-cyan-500/50 dark:text-cyan-400"
        onClick={onOpenHistoryModal}
      />
      <ToolbarTooltipButton
        icon={<Copy className="h-6 w-6" />}
        tooltip={<p>Copy from Previous</p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-teal-500/20 hover:bg-teal-500/30 border-teal-500/50 text-teal-700 dark:!bg-teal-500/20 dark:hover:!bg-teal-500/30 dark:border-teal-500/50 dark:text-teal-400"
        onClick={onOpenCopyModal}
      />
      <ToolbarTooltipButton
        icon={<Trash2 className="h-6 w-6" />}
        tooltip={<p>Reset All</p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-red-700 dark:!bg-red-500/20 dark:hover:!bg-red-500/30 dark:border-red-500/50 dark:text-red-400"
        onClick={onOpenResetConfirm}
      />
    </div>
  </div>
);

/** Button + Tooltip combination for a single outlook type; handles active/low-probability states and the keyboard-shortcut tooltip. */
const OutlookTypeButton: React.FC<{
  type: OutlookType;
  isActive: boolean;
  hasLowProb: boolean;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ type, isActive, hasLowProb, className, onClick, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={isActive ? 'default' : 'secondary'}
        size="sm"
        className={cn(className, hasLowProb && "border-success-foreground border-2")}
        onClick={onClick}
      >
        {children}
        {hasLowProb && (
          <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-success-foreground bg-background rounded-full" />
        )}
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{outlookLabels[type]} <span className="text-muted-foreground">({outlookShortcuts[type]})</span></p>
    </TooltipContent>
  </Tooltip>
);

/** Forecast day navigator: cycle date display/edit, prev/next arrows, and the 4×2 day button grid. */
const ToolbarForecastDaySection: React.FC<{
  isEditingDate: boolean;
  tempDate: string;
  cycleDate: string;
  currentDay: DayType;
  days: ReturnType<typeof selectForecastCycle>['days'];
  onDateSave: () => void;
  onTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartDateEdit: () => void;
  onDayButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
}> = ({ isEditingDate, tempDate, cycleDate, currentDay, days, onDateSave, onTempDateChange, onStartDateEdit, onDayButtonClick, onPrevDay, onNextDay }) => (
  <div className="border-r border-border pr-2 lg:pr-3">
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Cycle</span>
        {isEditingDate ? (
          <div className="flex items-center gap-1">
            <Input type="date" value={tempDate} onChange={onTempDateChange} className="h-6 text-xs w-32" />
            <Button size="icon-sm" variant="ghost" className="h-6 w-6" onClick={onDateSave}>✓</Button>
          </div>
        ) : (
          <button
            onClick={onStartDateEdit}
            className="px-2 py-1 text-xs rounded border border-border bg-secondary hover:bg-accent transition-colors focus:outline-none select-none"
          >
            {new Date(cycleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" className="h-[124px] lg:h-[140px] w-9 lg:w-10" onClick={onPrevDay} disabled={currentDay === 1}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="grid grid-cols-4 grid-rows-2 gap-1.5 lg:gap-2">
          {DAYS.map((day) => {
            const hasData = hasDayOutlookData(days, day);
            const isActive = currentDay === day;
            return (
              <Tooltip key={day}>
                <TooltipTrigger asChild>
                  <button
                    data-day={day}
                    onClick={onDayButtonClick}
                    className={cn(
                      'relative h-16 w-16 text-base font-semibold rounded-md transition-all',
                      'lg:h-16 lg:w-16 h-14 w-14',
                      'hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring',
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    {day}
                    {hasData && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-success rounded-full" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Day {day} (Press {day})</p></TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <Button size="icon" variant="ghost" className="h-[124px] lg:h-[140px] w-9 lg:w-10" onClick={onNextDay} disabled={currentDay === 8}>
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>
    </div>
  </div>
);

/** Outlook type selector; adapts layout based on how many types are available (1 = Day 4-8 full-height, 2 = Day 3 stacked, 4 = Day 1/2 grid). */
const ToolbarOutlookTypeSection: React.FC<{
  availableTypes: OutlookType[];
  activeOutlookType: OutlookType;
  lowProbabilityOutlooks: OutlookType[];
  outlookTypeHandlers: Record<OutlookType, () => void>;
}> = ({ availableTypes, activeOutlookType, lowProbabilityOutlooks, outlookTypeHandlers }) => (
  <div className="border-r border-border pr-2 lg:pr-4">
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</label>
      {availableTypes.length === 1 ? (
        <div className="h-[124px] lg:h-[140px]">
          {availableTypes.map((type) => (
            <OutlookTypeButton key={type} type={type} isActive={activeOutlookType === type} hasLowProb={lowProbabilityOutlooks.includes(type)} className="h-full w-[96px] lg:w-[110px] relative" onClick={outlookTypeHandlers[type]}>
              <div className="flex flex-col items-center gap-1">{outlookIcons[type]}<span className="text-sm">{outlookLabels[type]}</span></div>
            </OutlookTypeButton>
          ))}
        </div>
      ) : availableTypes.length === 2 ? (
        <div className="flex flex-col gap-2 h-[124px] lg:h-[140px]">
          {availableTypes.map((type) => (
            <OutlookTypeButton key={type} type={type} isActive={activeOutlookType === type} hasLowProb={lowProbabilityOutlooks.includes(type)} className="h-[58px] lg:h-[66px] w-[96px] lg:w-[110px] relative" onClick={outlookTypeHandlers[type]}>
              <div className="flex items-center gap-1">{outlookIcons[type]}<span className="text-sm">{outlookLabels[type]}</span></div>
            </OutlookTypeButton>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {availableTypes.slice(0, 4).map((type) => (
            <OutlookTypeButton key={type} type={type} isActive={activeOutlookType === type} hasLowProb={lowProbabilityOutlooks.includes(type)} className="h-14 lg:h-16 w-[96px] lg:w-[110px] relative" onClick={outlookTypeHandlers[type]}>
              <>{outlookIcons[type]}<span className="ml-1 text-sm">{outlookLabels[type]}</span></>
            </OutlookTypeButton>
          ))}
        </div>
      )}
    </div>
  </div>
);

/** Probability/Risk grid; column count adapts to the number of available probabilities. */
const ToolbarProbabilitySection: React.FC<{
  activeOutlookType: OutlookType;
  activeProbability: string;
  probabilities: string[];
  probabilityHandlers: Record<string, () => void>;
}> = ({ activeOutlookType, activeProbability, probabilities, probabilityHandlers }) => (
  <div className="flex-1 px-2 lg:px-3">
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {activeOutlookType === 'categorical' ? 'Risk' : 'Probability'}
      </label>
      <div
        className="grid gap-2 auto-rows-[60px]"
        style={{
          gridTemplateColumns: `repeat(${Math.ceil(probabilities.length / 2)}, 1fr)`,
          gridTemplateRows: 'repeat(2, 60px)',
        }}
      >
        {probabilities.map((prob, index) => {
          const isActive = activeProbability === prob;
          const color = getOutlookColor(activeOutlookType, prob);
          return (
            <Tooltip key={prob}>
              <TooltipTrigger asChild>
                <button
                  onClick={probabilityHandlers[prob]}
                  className={cn(
                    'px-4 py-3 text-sm font-bold rounded-md transition-all',
                    'border-2 focus:outline-none focus:ring-2 focus:ring-ring h-[60px]',
                    isActive ? 'ring-2 ring-ring ring-offset-2' : 'hover:opacity-80'
                  )}
                  style={{
                    backgroundColor: color,
                    borderColor: isActive ? 'var(--ring)' : 'transparent',
                    color: activeOutlookType === 'categorical' && ['TSTM', 'MRGL', 'SLGT'].includes(prob) ? '#000' : '#fff',
                    gridRow: (index % 2) + 1,
                    gridColumn: Math.floor(index / 2) + 1,
                  }}
                >
                  {prob}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {activeOutlookType === 'categorical' ? (
                  <p>{getCategoricalRiskDisplayName(prob as CategoricalRiskLevel)}</p>
                ) : (
                  <p>{prob} probability</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  </div>
);

/** Current-selection swatch + low-probability toggle button. */
/** Color swatch showing the active outlook type label and probability value. */
const CurrentSelectionSwatch: React.FC<{
  swatchClass: string;
  currentColor: string;
  labelColorClass: string;
  outlookLabel: string;
  activeProbability: string;
  sigSuffix: string;
}> = ({ swatchClass, currentColor, labelColorClass, outlookLabel, activeProbability, sigSuffix }) => (
  <div className={swatchClass} style={{ backgroundColor: currentColor }}>
    <span className={cn('text-sm font-bold whitespace-nowrap', labelColorClass)}>{outlookLabel}</span>
    <span className={cn('text-base font-bold whitespace-nowrap', labelColorClass)}>{activeProbability}{sigSuffix}</span>
  </div>
);

/** Toggle button for switching the active draw probability to "low probability" mode. */
const LowProbabilityToggle: React.FC<{
  toggleVariant: 'success' | 'outline';
  iconColorClass: string;
  lowProbLabel: string;
  onToggle: () => void;
}> = ({ toggleVariant, iconColorClass, lowProbLabel, onToggle }) => (
  <Button variant={toggleVariant} size="sm" className="w-full h-8 gap-2" onClick={onToggle}>
    <CheckCircle2 className={cn('h-4 w-4', iconColorClass)} />
    <span className="text-xs">{lowProbLabel}</span>
  </Button>
);

/** Confirmation dialog for the destructive "reset all drawings" action. */
const ResetConfirmDialog: React.FC<{
  open: boolean;
  onCancel: () => void;
  onReset: () => void;
}> = ({ open, onCancel, onReset }) => (
  <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reset All Drawings?</DialogTitle>
        <DialogDescription>This will clear all outlook polygons for all days. This action cannot be undone.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" onClick={onReset}>Reset All</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/** Displays the selected outlook type's color swatch, probability, and low-probability toggle. */
const ToolbarCurrentSelectionSection: React.FC<{
  activeOutlookType: OutlookType;
  activeProbability: string;
  isSignificant: boolean;
  significantThreatsEnabled: boolean;
  isLowProb: boolean;
  currentColor: string;
  onToggleLowProbability: () => void;
}> = ({ activeOutlookType, activeProbability, isSignificant, significantThreatsEnabled, isLowProb, currentColor, onToggleLowProbability }) => {
  const isDarkText = activeOutlookType === 'categorical' && ['TSTM', 'MRGL', 'SLGT'].includes(activeProbability);
  const labelColorClass = isDarkText ? 'text-black' : 'text-white';
  const swatchClass = cn('flex flex-col items-center justify-center px-3 lg:px-4 py-2 rounded-lg w-[190px] lg:w-[220px] h-[64px] lg:h-[72px] transition-all', isLowProb && 'opacity-40 grayscale');
  const sigSuffix = isSignificant && significantThreatsEnabled ? ' (Sig)' : '';
  const toggleVariant = isLowProb ? 'success' : 'outline' as const;
  const iconColorClass = isLowProb ? 'text-white' : 'text-muted-foreground';
  const lowProbLabel = activeOutlookType === 'categorical' ? 'No T-Storms' : 'Low Probability';
  return (
    <div className="border-l border-border pl-2 lg:pl-4">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Current</label>
        <div className="flex flex-col gap-1 justify-center" style={{ height: '124px' }}>
          <CurrentSelectionSwatch
            swatchClass={swatchClass}
            currentColor={currentColor}
            labelColorClass={labelColorClass}
            outlookLabel={outlookLabels[activeOutlookType]}
            activeProbability={activeProbability}
            sigSuffix={sigSuffix}
          />
          <LowProbabilityToggle
            toggleVariant={toggleVariant}
            iconColorClass={iconColorClass}
            lowProbLabel={lowProbLabel}
            onToggle={onToggleLowProbability}
          />
          <div className="text-[10px] text-center text-muted-foreground/50">T/W/L/C • ↑↓</div>
        </div>
      </div>
    </div>
  );
};

/** All modals and dialogs rendered by the toolbar: history, copy, export, and reset-confirm. */
const ToolbarModals: React.FC<{
  showHistoryModal: boolean;
  showCopyModal: boolean;
  showResetConfirm: boolean;
  isExportModalOpen: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCloseHistoryModal: () => void;
  onCloseCopyModal: () => void;
  onCancelReset: () => void;
  onReset: () => void;
  onConfirmExport: (title: string) => Promise<void>;
  onCancelExport: () => void;
}> = ({ showHistoryModal, showCopyModal, showResetConfirm, isExportModalOpen, fileInputRef, onFileSelect, onCloseHistoryModal, onCloseCopyModal, onCancelReset, onReset, onConfirmExport, onCancelExport }) => (
  <>
    <input ref={fileInputRef} type="file" accept=".json" onChange={onFileSelect} className="hidden" />
    <CycleHistoryModal isOpen={showHistoryModal} onClose={onCloseHistoryModal} />
    <CopyFromPreviousModal isOpen={showCopyModal} onClose={onCloseCopyModal} />
    <ExportModal isOpen={isExportModalOpen} onConfirm={onConfirmExport} onCancel={onCancelExport} />
    <ResetConfirmDialog open={showResetConfirm} onCancel={onCancelReset} onReset={onReset} />
  </>
);

/** Pure presentational view layer for the integrated bottom toolbar; delegates all state and actions to parent hooks via props. */
const IntegratedToolbarView: React.FC<IntegratedToolbarViewProps> = (props) => {
  const {
    onSave, onLoadClick, onInitiateExport, onPackageDownload,
    onOpenHistoryModal, onOpenCopyModal, onOpenResetConfirm,
    onDateSave, onTempDateChange, onStartDateEdit,
    onDayButtonClick, onPrevDay, onNextDay,
    onToggleLowProbability,
    onCloseHistoryModal, onCloseCopyModal, onCancelReset, onReset,
    onFileSelect, onConfirmExport, onCancelExport,
    fileInputRef,
    isSaved, isExporting, isExportModalOpen, isPackageDownloading,
    showHistoryModal, showCopyModal, showResetConfirm,
    isEditingDate, tempDate, cycleDate,
    currentDay, days, availableTypes,
    activeOutlookType, activeProbability, isSignificant, significantThreatsEnabled,
    lowProbabilityOutlooks, outlookTypeHandlers,
    probabilities, probabilityHandlers,
    currentColor, isLowProb,
  } = props;

  return (
    <TooltipProvider>
      <div className="fixed bottom-0 left-0 right-0 z-panel bg-background border-t border-border shadow-lg h-[200px] overflow-hidden">
        <div className="h-full overflow-x-auto overflow-y-hidden">
          <div className="flex items-center justify-center gap-2 lg:gap-3 px-2 sm:px-3 lg:px-4 h-full min-w-max">
            <ToolbarToolsSection
              onSave={onSave} onLoadClick={onLoadClick} onInitiateExport={onInitiateExport}
              onPackageDownload={onPackageDownload} onOpenHistoryModal={onOpenHistoryModal}
              onOpenCopyModal={onOpenCopyModal} onOpenResetConfirm={onOpenResetConfirm}
              isSaved={isSaved} isExporting={isExporting} isPackageDownloading={isPackageDownloading}
            />
            <ToolbarForecastDaySection
              isEditingDate={isEditingDate} tempDate={tempDate} cycleDate={cycleDate}
              currentDay={currentDay} days={days}
              onDateSave={onDateSave} onTempDateChange={onTempDateChange} onStartDateEdit={onStartDateEdit}
              onDayButtonClick={onDayButtonClick} onPrevDay={onPrevDay} onNextDay={onNextDay}
            />
            <ToolbarOutlookTypeSection
              availableTypes={availableTypes} activeOutlookType={activeOutlookType}
              lowProbabilityOutlooks={lowProbabilityOutlooks} outlookTypeHandlers={outlookTypeHandlers}
            />
            <ToolbarProbabilitySection
              activeOutlookType={activeOutlookType} activeProbability={activeProbability}
              probabilities={probabilities} probabilityHandlers={probabilityHandlers}
            />
            <ToolbarCurrentSelectionSection
              activeOutlookType={activeOutlookType} activeProbability={activeProbability}
              isSignificant={isSignificant} significantThreatsEnabled={significantThreatsEnabled}
              isLowProb={isLowProb} currentColor={currentColor}
              onToggleLowProbability={onToggleLowProbability}
            />
          </div>
        </div>
      </div>
      <ToolbarModals
        showHistoryModal={showHistoryModal} showCopyModal={showCopyModal}
        showResetConfirm={showResetConfirm} isExportModalOpen={isExportModalOpen}
        fileInputRef={fileInputRef} onFileSelect={onFileSelect}
        onCloseHistoryModal={onCloseHistoryModal} onCloseCopyModal={onCloseCopyModal}
        onCancelReset={onCancelReset} onReset={onReset}
        onConfirmExport={onConfirmExport} onCancelExport={onCancelExport}
      />
    </TooltipProvider>
  );
};

/** Manages local UI state for the toolbar: modal visibility flags, the file input ref, date-editing state, and package download state. */
const useToolbarLocalUi = (cycleDate: string) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isPackageDownloading, setIsPackageDownloading] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState('');

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

  return {
    fileInputRef,
    showHistoryModal,
    showCopyModal,
    showResetConfirm,
    isPackageDownloading,
    isEditingDate,
    tempDate,
    setShowResetConfirm,
    setIsPackageDownloading,
    setIsEditingDate,
    handleOpenHistoryModal,
    handleOpenCopyModal,
    handleOpenResetConfirm,
    handleCloseHistoryModal,
    handleCloseCopyModal,
    handleCancelReset,
    handleTempDateChange,
    handleStartDateEdit,
  };
};

/** Selects and derives all forecast-domain data needed by the toolbar: current cycle, day, outlook types, export state, and outlet panel logic. */
const useToolbarDataModel = (mapRef: React.RefObject<ForecastMapHandle | null>, addToast: AddToastFn) => {
  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days, cycleDate } = forecastCycle;
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
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

  const availableTypes = (['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'] as OutlookType[])
    .filter((type) => panel.getOutlookTypeEnabled(type));
  const currentColor = getOutlookColor(panel.activeOutlookType, panel.activeProbability);
  const isLowProb = lowProbabilityOutlooks.includes(panel.activeOutlookType);

  return {
    forecastCycle,
    currentDay,
    days,
    cycleDate,
    isSaved,
    lowProbabilityOutlooks,
    availableTypes,
    currentColor,
    isLowProb,
    ...panel,
    isExporting,
    isExportModalOpen: isModalOpen,
    onInitiateExport: initiateExport,
    onConfirmExport: confirmExport,
    onCancelExport: cancelExport,
  };
};

interface ToolbarActionParams {
  dispatch: ReturnType<typeof useDispatch>;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  currentDay: DayType;
  cycleDate: string;
  tempDate: string;
  setIsEditingDate: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPackageDownloading: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleCancelReset: () => void;
}

/** Constructs all event-handler callbacks for toolbar actions: save, load, day navigation, date editing, reset, export, and package download. */
const useToolbarActionHandlers = ({
  dispatch,
  onLoad,
  mapRef,
  addToast,
  forecastCycle,
  currentDay,
  tempDate,
  setIsEditingDate,
  setIsPackageDownloading,
  fileInputRef,
  handleCancelReset,
}: ToolbarActionParams) => {
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
    const file = e.target.files?.[0];
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
    if (currentDay > 1) {
      dispatch(setForecastDay((currentDay - 1) as DayType));
    }
  }, [dispatch, currentDay]);

  const handleNextDay = useCallback(() => {
    if (currentDay < 8) {
      dispatch(setForecastDay((currentDay + 1) as DayType));
    }
  }, [dispatch, currentDay]);

  const handleDateSave = useCallback(() => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  }, [dispatch, tempDate, setIsEditingDate]);

  const handleDayButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(e.currentTarget.dataset.day) as DayType;
    if (!Number.isNaN(day)) {
      handleDayChange(day);
    }
  }, [handleDayChange]);

  const handleToggleLowProbability = useCallback(() => dispatch(toggleLowProbability()), [dispatch]);

  return {
    onLoadClick: handleLoadClick,
    onPackageDownload: handlePackageDownload,
    onDateSave: handleDateSave,
    onDayButtonClick: handleDayButtonClick,
    onPrevDay: handlePrevDay,
    onNextDay: handleNextDay,
    onToggleLowProbability: handleToggleLowProbability,
    onReset: handleReset,
    onFileSelect: handleFileSelect,
  };
};

/** Top-level integrated toolbar component; composes data, local-UI, and action hooks then delegates rendering to IntegratedToolbarView. */
export const IntegratedToolbar: React.FC<IntegratedToolbarProps> = ({
  onSave,
  onLoad,
  mapRef,
  addToast,
}) => {
  const dispatch = useDispatch();
  const model = useToolbarDataModel(mapRef, addToast);

  const localUi = useToolbarLocalUi(model.cycleDate);
  const handlers = useToolbarActionHandlers({
    dispatch,
    onLoad,
    mapRef,
    addToast,
    forecastCycle: model.forecastCycle,
    currentDay: model.currentDay,
    cycleDate: model.cycleDate,
    tempDate: localUi.tempDate,
    setIsEditingDate: localUi.setIsEditingDate,
    setIsPackageDownloading: localUi.setIsPackageDownloading,
    fileInputRef: localUi.fileInputRef,
    handleCancelReset: localUi.handleCancelReset,
  });

  return (
    <IntegratedToolbarView
      onSave={onSave}
      onOpenHistoryModal={localUi.handleOpenHistoryModal}
      onOpenCopyModal={localUi.handleOpenCopyModal}
      onOpenResetConfirm={localUi.handleOpenResetConfirm}
      onCloseHistoryModal={localUi.handleCloseHistoryModal}
      onCloseCopyModal={localUi.handleCloseCopyModal}
      onCancelReset={localUi.handleCancelReset}
      onTempDateChange={localUi.handleTempDateChange}
      onStartDateEdit={localUi.handleStartDateEdit}
      {...handlers}
      {...localUi}
      {...model}
    />
  );
};

export default IntegratedToolbar;
