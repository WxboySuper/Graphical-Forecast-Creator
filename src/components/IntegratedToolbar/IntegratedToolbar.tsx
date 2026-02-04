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

export const IntegratedToolbar: React.FC<IntegratedToolbarProps> = ({
  onSave,
  onLoad,
  mapRef,
  addToast,
}) => {
  const dispatch = useDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState('');

  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days, cycleDate } = forecastCycle;
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const lowProbabilityOutlooks = useSelector((state: RootState) => 
    state.forecast.forecastCycle.days[currentDay]?.metadata?.lowProbabilityOutlooks || []
  );
  const outlooks = useSelector((state: RootState) => 
    state.forecast.forecastCycle.days[currentDay]?.data || {}
  );
  const isExportDisabled = useSelector((state: RootState) => 
    state.featureFlags.exportMapEnabled === false
  );

  const {
    activeOutlookType,
    activeProbability,
    isSignificant,
    significantThreatsEnabled,
    getOutlookTypeEnabled,
    outlookTypeHandlers,
    probabilities,
    probabilityHandlers,
  } = useOutlookPanelLogic();

  const isLowProb = lowProbabilityOutlooks.includes(activeOutlookType);

  // Export hook
  const { isModalOpen, initiateExport, confirmExport, cancelExport } = useExportMap({
    mapRef,
    outlooks,
    isExportDisabled,
    addToast,
  });

  // Available outlook types - include all, let getOutlookTypeEnabled filter by day
  const availableTypes = (['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'] as OutlookType[])
    .filter(type => getOutlookTypeEnabled(type));

  const currentColor = getOutlookColor(activeOutlookType, activeProbability);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoad(file);
    }
    e.target.value = '';
  }, [onLoad]);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReset = useCallback(() => {
    dispatch(resetForecasts());
    setShowResetConfirm(false);
    addToast('All drawings reset', 'info');
  }, [dispatch, addToast]);

  const handleDayChange = useCallback((day: DayType) => {
    dispatch(setForecastDay(day));
  }, [dispatch]);

  const handlePrevDay = useCallback(() => {
    if (currentDay > 1) {
      dispatch(setForecastDay((currentDay - 1) as DayType));
    }
  }, [currentDay, dispatch]);

  const handleNextDay = useCallback(() => {
    if (currentDay < 8) {
      dispatch(setForecastDay((currentDay + 1) as DayType));
    }
  }, [currentDay, dispatch]);

  const handleDateSave = useCallback(() => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  }, [dispatch, tempDate]);

  const hasDataForDay = useCallback((day: DayType) => {
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
  }, [days]);

  return (
    <TooltipProvider>
      <div className="fixed bottom-0 left-0 right-0 z-panel bg-background border-t border-border shadow-lg h-[200px]">
        <div className="flex items-center justify-center gap-3 px-4 h-full">
          {/* Tools Section - Always Visible */}
          <div className="flex flex-col gap-3 border-r border-border pr-4">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-16 w-16 bg-green-500/20 hover:bg-green-500/30 border-green-500/50 text-green-700 dark:!bg-green-500/20 dark:hover:!bg-green-500/30 dark:border-green-500/50 dark:text-green-400"
                    onClick={onSave}
                    disabled={isSaved}
                  >
                    <Save className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Save to JSON <span className="text-muted-foreground">(⌃S)</span></p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-16 w-16 bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/50 text-blue-700 dark:!bg-blue-500/20 dark:hover:!bg-blue-500/30 dark:border-blue-500/50 dark:text-blue-400"
                    onClick={handleLoadClick}
                  >
                    <Upload className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Load from JSON <span className="text-muted-foreground">(⌃L)</span></p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-16 w-16 bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/50 text-orange-700 dark:!bg-orange-500/20 dark:hover:!bg-orange-500/30 dark:border-orange-500/50 dark:text-orange-400"
                    onClick={initiateExport}
                  >
                    <ImageIcon className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export Image <span className="text-muted-foreground">(⌃E)</span></p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-16 w-16 bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/50 text-cyan-700 dark:!bg-cyan-500/20 dark:hover:!bg-cyan-500/30 dark:border-cyan-500/50 dark:text-cyan-400"
                    onClick={() => setShowHistoryModal(true)}
                  >
                    <History className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cycle History</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-16 w-16 bg-teal-500/20 hover:bg-teal-500/30 border-teal-500/50 text-teal-700 dark:!bg-teal-500/20 dark:hover:!bg-teal-500/30 dark:border-teal-500/50 dark:text-teal-400"
                    onClick={() => setShowCopyModal(true)}
                  >
                    <Copy className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy from Previous</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-16 w-16 bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-red-700 dark:!bg-red-500/20 dark:hover:!bg-red-500/30 dark:border-red-500/50 dark:text-red-400"
                    onClick={() => setShowResetConfirm(true)}
                  >
                    <Trash2 className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset All</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Forecast Day Section - 2 Rows */}
          <div className="border-r border-border pr-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Cycle</span>
                {isEditingDate ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="date"
                      value={tempDate}
                      onChange={(e) => setTempDate(e.target.value)}
                      className="h-6 text-xs w-32"
                    />
                    <Button 
                      size="icon-sm" 
                      variant="ghost" 
                      className="h-6 w-6"
                      onClick={handleDateSave}
                    >
                      ✓
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setTempDate(cycleDate);
                      setIsEditingDate(true);
                    }}
                    className="px-2 py-1 text-xs rounded border border-border bg-secondary hover:bg-accent transition-colors focus:outline-none select-none"
                  >
                    {new Date(cycleDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-[140px] w-10"
                  onClick={handlePrevDay}
                  disabled={currentDay === 1}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>

                <div className="grid grid-cols-4 grid-rows-2 gap-2">
                  {DAYS.map((day) => {
                    const hasData = hasDataForDay(day);
                    const isActive = currentDay === day;

                    return (
                      <Tooltip key={day}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleDayChange(day)}
                            className={cn(
                              'relative h-16 w-16 text-base font-semibold rounded-md transition-all',
                              'hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring',
                              isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground'
                            )}
                          >
                            {day}
                            {hasData && (
                              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-success rounded-full" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Day {day} (Press {day})</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-[140px] w-10"
                  onClick={handleNextDay}
                  disabled={currentDay === 8}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>
            </div>
          </div>

          {/* Outlook Type Section */}
          <div className="border-r border-border pr-4">
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Type
              </label>
              {/* Dynamic layout based on number of outlook types */}
              {availableTypes.length === 1 ? (
                // Day 4-8: Single button fills entire space
                <div className="h-[140px]">
                  {availableTypes.map((type) => (
                    <Tooltip key={type}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={activeOutlookType === type ? 'default' : 'secondary'}
                          size="sm"
                          className={cn(
                            "h-full w-[110px] relative",
                            lowProbabilityOutlooks.includes(type) && "border-success-foreground border-2"
                          )}
                          onClick={outlookTypeHandlers[type]}
                        >
                          <div className="flex flex-col items-center gap-1">
                            {outlookIcons[type]}
                            <span className="text-sm">{outlookLabels[type]}</span>
                          </div>
                          {lowProbabilityOutlooks.includes(type) && (
                            <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-success-foreground bg-background rounded-full" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{outlookLabels[type]} <span className="text-muted-foreground">({outlookShortcuts[type]})</span></p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ) : availableTypes.length === 2 ? (
                // Day 3: Stack vertically (Categorical on top, Total Severe on bottom)
                <div className="flex flex-col gap-2 h-[140px]">
                  {availableTypes.map((type) => (
                    <Tooltip key={type}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={activeOutlookType === type ? 'default' : 'secondary'}
                          size="sm"
                          className={cn(
                            "h-[66px] w-[110px] relative",
                            lowProbabilityOutlooks.includes(type) && "border-success-foreground border-2"
                          )}
                          onClick={outlookTypeHandlers[type]}
                        >
                          <div className="flex items-center gap-1">
                            {outlookIcons[type]}
                            <span className="text-sm">{outlookLabels[type]}</span>
                          </div>
                          {lowProbabilityOutlooks.includes(type) && (
                            <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-success-foreground bg-background rounded-full" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{outlookLabels[type]} <span className="text-muted-foreground">({outlookShortcuts[type]})</span></p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                // Day 1/2: 2x2 grid layout
                <div className="grid grid-cols-2 grid-rows-2 gap-2">
                  {availableTypes.slice(0, 4).map((type) => (
                    <Tooltip key={type}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={activeOutlookType === type ? 'default' : 'secondary'}
                          size="sm"
                          className={cn(
                            "h-16 w-[110px] relative",
                            lowProbabilityOutlooks.includes(type) && "border-success-foreground border-2"
                          )}
                          onClick={outlookTypeHandlers[type]}
                        >
                          {outlookIcons[type]}
                          <span className="ml-1 text-sm">{outlookLabels[type]}</span>
                          {lowProbabilityOutlooks.includes(type) && (
                            <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-success-foreground bg-background rounded-full" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{outlookLabels[type]} <span className="text-muted-foreground">({outlookShortcuts[type]})</span></p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Probability Section - Flexible */}
          <div className="flex-1 px-3">
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {activeOutlookType === 'categorical' ? 'Risk' : 'Probability'}
              </label>
              <div className="grid gap-2 auto-rows-[60px]" style={{
                gridTemplateColumns: `repeat(${Math.ceil(probabilities.length / 2)}, 1fr)`,
                gridTemplateRows: 'repeat(2, 60px)'
              }}>
                {probabilities.map((prob, index) => {
                  const isActive = activeProbability === prob;
                  const color = getOutlookColor(activeOutlookType, prob);
                  const row = (index % 2) + 1;
                  const col = Math.floor(index / 2) + 1;
                  
                  return (
                    <Tooltip key={prob}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={probabilityHandlers[prob]}
                          className={cn(
                            'px-4 py-3 text-sm font-bold rounded-md transition-all',
                            'border-2 focus:outline-none focus:ring-2 focus:ring-ring',
                            'h-[60px]',
                            isActive 
                              ? 'ring-2 ring-ring ring-offset-2' 
                              : 'hover:opacity-80'
                          )}
                          style={{
                            backgroundColor: color,
                            borderColor: isActive ? 'var(--ring)' : 'transparent',
                            color: activeOutlookType === 'categorical' && 
                              ['TSTM', 'MRGL', 'SLGT'].includes(prob) 
                              ? '#000' 
                              : '#fff',
                            gridRow: row,
                            gridColumn: col,
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

          {/* Current Selection */}
          <div className="border-l border-border pl-4">
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                Current
              </label>
              <div className="flex flex-col gap-1 justify-center" style={{ height: '140px' }}>
                <div 
                  className={cn(
                    "flex flex-col items-center justify-center px-4 py-2 rounded-lg w-[220px] h-[72px] transition-all",
                    isLowProb && "opacity-40 grayscale"
                  )}
                  style={{ backgroundColor: currentColor }}
                >
                  <span 
                    className={cn(
                      "text-sm font-bold whitespace-nowrap",
                      activeOutlookType === 'categorical' && 
                        ['TSTM', 'MRGL', 'SLGT'].includes(activeProbability)
                        ? 'text-black'
                        : 'text-white'
                    )}
                  >
                    {outlookLabels[activeOutlookType]}
                  </span>
                  <span 
                    className={cn(
                      "text-base font-bold whitespace-nowrap",
                      activeOutlookType === 'categorical' && 
                        ['TSTM', 'MRGL', 'SLGT'].includes(activeProbability)
                        ? 'text-black'
                        : 'text-white'
                    )}
                  >
                    {activeProbability}
                    {isSignificant && significantThreatsEnabled && ' (Sig)'}
                  </span>
                </div>
                
                <Button
                  variant={isLowProb ? 'success' : 'outline'}
                  size="sm"
                  className="w-full h-8 gap-2"
                  onClick={() => dispatch(toggleLowProbability())}
                >
                  <CheckCircle2 className={cn("h-4 w-4", isLowProb ? "text-white" : "text-muted-foreground")} />
                  <span className="text-xs">
                    {activeOutlookType === 'categorical' ? 'No T-Storms' : 'Low Probability'}
                  </span>
                </Button>

                <div className="text-[10px] text-center text-muted-foreground/50">
                  T/W/L/C • ↑↓
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Modals */}
      <CycleHistoryModal 
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />

      <CopyFromPreviousModal 
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
      />

      <ExportModal
        isOpen={isModalOpen}
        onConfirm={confirmExport}
        onCancel={cancelExport}
      />

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Drawings?</DialogTitle>
            <DialogDescription>
              This will clear all outlook polygons for all days. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default IntegratedToolbar;
