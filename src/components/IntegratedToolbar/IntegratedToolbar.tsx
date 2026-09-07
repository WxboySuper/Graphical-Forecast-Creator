import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Tabs, TabsContent } from '../ui/tabs';
import {
  TooltipProvider,
} from '../ui/tooltip';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { isFeatureExposed } from '../../config/featureExposure';
import PopulationEstimateBeta from '../PopulationEstimate/PopulationEstimateBeta';
import { getCategoricalRiskDisplayName, getOutlookColor } from '../../utils/outlookUtils';
import type { CategoricalRiskLevel, OutlookType } from '../../types/outlooks';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import {
  FORECAST_DAYS,
  FORECAST_BASE_MAP_OPTIONS,
  getContrastTextColor,
  hasDayOutlookData,
  outlookIcons,
  outlookLabels,
} from '../ForecastWorkspace/workspaceMeta';

/** Returns the display color used for a non-active outlook layer. */
const getGhostLayerColor = (type: OutlookType) => getOutlookColor({ outlookType: type, probability: type === 'categorical' ? 'SLGT' : '15%' });
import TabbedToolbarSelectionStrip, { OutlookTrimToolbarSection } from './TabbedToolbarSelectionStrip';
import CustomDrawPanel from './CustomDrawPanel';
import CustomProductsDialog from './CustomProductsDialog';
import type { RootState } from '../../store';
import { setCustomEditorMode } from '../../store/forecastSlice';
import { TabbedIntegratedToolbarTabsList, type TabbedToolbarTabKey } from './IntegratedToolbarTabsList';
import {
  getTabbedToolbarActionItems,
  groupTabbedToolbarActions,
  TabbedToolbarActionGroup,
} from './TabbedToolbarActions';
import './IntegratedToolbar.css';

interface IntegratedToolbarProps {
  controller: ForecastWorkspaceController;
  autoTstmTools?: React.ReactNode;
}

const tabbedToolbarTypeLabels: Partial<Record<OutlookType, string>> = {
  tornado: 'Tor',
  wind: 'Wind',
  hail: 'Hail',
  categorical: 'Cat',
  totalSevere: 'Severe',
  'day4-8': 'D4-8',
};

/** Section wrapper used inside tab rows to group related controls. */
const TabbedToolbarStripSection: React.FC<{
  label: string;
  hint?: string;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}> = ({ label, hint, className, contentClassName, children }) => (
  <section className={cn('tabbed-integrated-toolbar__section flex h-full shrink-0 items-center gap-2 border-r border-border/70 pr-2 last:border-r-0 last:pr-0', className)}>
    <div className="flex w-[74px] shrink-0 flex-col justify-center">
      <span className="tabbed-integrated-toolbar__section-label text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80 leading-tight">{label}</span>
      {hint ? (
        <span className="tabbed-integrated-toolbar__section-hint mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
          {hint}
        </span>
      ) : null}
    </div>
    <div className={cn('tabbed-integrated-toolbar__section-content flex min-h-0 min-w-0 flex-1 items-center', contentClassName)}>{children}</div>
  </section>
);

/** Button for selecting an outlook type in the tabbed toolbar. */
const TabbedToolbarTypeButton: React.FC<{
  controller: ForecastWorkspaceController;
  type: OutlookType;
}> = ({ controller, type }) => {
  const isActive = controller.activeOutlookType === type;
  const hasLowProb = controller.lowProbabilityOutlooks.includes(type);

  return (
    <button
      type="button"
      title={outlookLabels[type]}
      onClick={controller.outlookTypeHandlers[type]}
      className={cn(
        'tabbed-integrated-toolbar__type-button relative flex h-10 min-w-[72px] items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-all',
        isActive
          ? 'is-active border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
          : 'border-border/80 bg-background text-foreground hover:border-primary/30 hover:bg-accent/60',
        hasLowProb && !isActive && 'border-success/60'
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn('shrink-0', isActive ? 'text-primary-foreground' : 'text-primary')}>
          {outlookIcons[type]}
        </span>
        <span className="truncate text-xs font-semibold">
          {tabbedToolbarTypeLabels[type] ?? outlookLabels[type]}
        </span>
      </span>
      {hasLowProb ? (
        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" />
      ) : null}
    </button>
  );
};

/** Probability / risk button used within the probability scale. */
const TabbedToolbarProbabilityButton: React.FC<{
  controller: ForecastWorkspaceController;
  probability: string;
}> = ({ controller, probability }) => {
  const isActive = controller.activeProbability === probability;
  const color = getOutlookColor({ outlookType: controller.activeOutlookType, probability });
  const isLightCategorical =
    controller.activeOutlookType === 'categorical' && ['TSTM', 'MRGL', 'SLGT'].includes(probability);
  const tooltipLabel =
    controller.activeOutlookType === 'categorical'
      ? getCategoricalRiskDisplayName(probability as CategoricalRiskLevel)
      : `${probability} probability`;

  return (
    <button
      type="button"
      onClick={controller.probabilityHandlers[probability]}
      title={tooltipLabel}
      className={cn(
        'tabbed-integrated-toolbar__probability-button flex h-9 min-w-[58px] items-center justify-center rounded-xl border px-3 text-sm font-black transition-all',
        isActive ? 'is-active shadow-sm' : 'hover:opacity-90'
      )}
      style={{
        backgroundColor: color,
        borderColor: isActive ? 'rgba(15, 23, 42, 0.24)' : 'transparent',
        color: isLightCategorical ? '#111827' : '#ffffff',
      }}
    >
      <span>{probability}</span>
    </button>
  );
};

/* TabbedToolbarSelectionStrip moved to its own file (TabbedToolbarSelectionStrip.tsx) */

/** Row wrapper for tabbed toolbar sections. */
const TabbedToolbarTabRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /** Translate vertical trackpad wheel deltas into horizontal scroll on the toolbar row. */
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    const canScroll = row.scrollWidth > row.clientWidth;

    if (!canScroll || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
      return;
    }

    row.scrollLeft += event.deltaY;
    event.preventDefault();
  };

  return (
    <div
      className="tabbed-integrated-toolbar__row h-full overflow-x-auto overflow-y-hidden"
      onWheel={handleWheel}
      role="group"
      aria-label="Toolbar controls"
    >
      <div className="flex h-full min-w-max items-stretch gap-2">{children}</div>
    </div>
  );
};

/** Small stat pill used to display compact numeric metadata. */
const TabbedToolbarStatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="tabbed-integrated-toolbar__stat-pill rounded-xl border border-border/70 bg-muted/35 px-2.5 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground leading-none">{label}</p>
    <p className="mt-1 text-xs font-black text-foreground">{value}</p>
  </div>
);

/** Existing severe-weather controls, unchanged when custom products are unavailable. */
const SevereDrawControls: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <>
    <TabbedToolbarStripSection label="Outlook Type" hint="T / W / H / C" className="tabbed-integrated-toolbar__section--type w-[316px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {controller.availableTypes.map((type) => (
          <TabbedToolbarTypeButton key={type} controller={controller} type={type} />
        ))}
      </div>
    </TabbedToolbarStripSection>

    <TabbedToolbarStripSection
      label={controller.activeOutlookType === 'categorical' ? 'Risk Scale' : 'Probability Scale'}
      hint="Arrow Keys"
      className="tabbed-integrated-toolbar__section--probability min-w-[500px] flex-1"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {controller.probabilities.map((probability) => (
          <TabbedToolbarProbabilityButton
            key={probability}
            controller={controller}
            probability={probability}
          />
        ))}
      </div>
    </TabbedToolbarStripSection>

    <TabbedToolbarStripSection label="Current Selection" className="tabbed-integrated-toolbar__section--selection w-[360px]">
      <TabbedToolbarSelectionStrip controller={controller} showShortcuts={false} />
    </TabbedToolbarStripSection>
  </>
);

/** Draw tab with an animated switch between severe and custom layers. */
const TabbedToolbarDrawTab: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const dispatch = useDispatch();
  const storedMode = useSelector((state: RootState) => state.forecast.customEditor.mode);
  const customExposed = isFeatureExposed('customProducts');

  if (!customExposed) {
    return <TabbedToolbarTabRow><SevereDrawControls controller={controller} /></TabbedToolbarTabRow>;
  }

  return (
    <TabbedToolbarTabRow>
      <TabbedToolbarStripSection label="Draw mode" className="tabbed-integrated-toolbar__section--product-mode">
        <div className={cn('custom-product-toggle', storedMode === 'custom' && 'is-custom-mode')} role="radiogroup" aria-label="Drawing product" data-testid="custom-product-toggle">
          <span className="custom-product-toggle__indicator" aria-hidden="true" />
          {(['severe', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={storedMode === mode}
              className={cn(
                'custom-product-toggle__button integrated-toolbar-mode-toggle-btn',
                mode === 'severe' ? 'custom-product-toggle__button--leading' : 'custom-product-toggle__button--trailing',
                storedMode === mode && 'is-active',
              )}
              style={{ backgroundColor: storedMode === mode ? 'var(--button-bg)' : 'transparent' }}
              onClick={() => dispatch(setCustomEditorMode(mode))}
            >
              {mode === 'severe' ? 'Severe' : 'Custom'}
            </button>
          ))}
        </div>
      </TabbedToolbarStripSection>
      <div key={storedMode} className="custom-product-mode-panel">
        {storedMode === 'severe' ? (
          <SevereDrawControls controller={controller} />
        ) : (
          <>
            <TabbedToolbarStripSection label="Library" className="w-[184px]">
              <CustomProductsDialog />
            </TabbedToolbarStripSection>
            <CustomDrawPanel />
          </>
        )}
      </div>
    </TabbedToolbarTabRow>
  );
};

/** Control for cycle date selection/editor used in the Days tab. */
const CycleDateControl: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  if (controller.isEditingDate) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={controller.tempDate}
          onChange={controller.onTempDateChange}
          className="tabbed-integrated-toolbar__input h-10 w-[170px] rounded-xl"
        />
        <Button className="tabbed-integrated-toolbar__primary-action h-10 rounded-xl px-3" onClick={controller.onDateSave}>
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="tabbed-integrated-toolbar__date-card flex items-baseline gap-2 rounded-xl border border-border/80 bg-background px-3 py-[9px]">
        <p className="text-sm font-semibold text-foreground whitespace-nowrap">
          {new Date(`${controller.cycleDate}T00:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </p>
        <p className="text-[11px] text-muted-foreground">Cycle {controller.cycleDate}</p>
      </div>
      <Button variant="outline" className="tabbed-integrated-toolbar__ghost-action h-10 rounded-xl px-3" onClick={controller.onStartDateEdit}>
        Edit
      </Button>
    </div>
  );
};

/** Cycle date strip wrapper used in the Days tab. */
const CycleDateStrip: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarStripSection label="Cycle Date" className="tabbed-integrated-toolbar__section--date w-[300px]">
    <CycleDateControl controller={controller} />
  </TabbedToolbarStripSection>
);

/** Forecast days strip with prev/next and day buttons. */
const ForecastDaysStrip: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarStripSection label="Forecast Days" hint="1-8" className="tabbed-integrated-toolbar__section--days w-[510px]">
    <div className="flex items-center gap-2">
      <Button size="icon" variant="outline" className="tabbed-integrated-toolbar__ghost-action h-10 w-10 shrink-0 rounded-xl" onClick={controller.onPrevDay} disabled={controller.currentDay === 1}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="tabbed-integrated-toolbar__day-strip flex min-w-max items-center gap-1 rounded-2xl p-1">
          {FORECAST_DAYS.map((day) => {
            const isActive = controller.currentDay === day;
            const hasData = hasDayOutlookData(controller.days, day);

            return (
              <button
                key={day}
                type="button"
                data-day={day}
                onClick={controller.onDayButtonClick}
                className={cn(
                  'tabbed-integrated-toolbar__day-button relative h-10 min-w-[48px] rounded-xl border px-3 text-sm font-semibold transition-all',
                  isActive
                    ? 'is-active border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'border-transparent bg-transparent hover:bg-background'
                )}
              >
                {day}
                {hasData ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-success" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      <Button size="icon" variant="outline" className="tabbed-integrated-toolbar__ghost-action h-10 w-10 shrink-0 rounded-xl" onClick={controller.onNextDay} disabled={controller.currentDay === 8}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  </TabbedToolbarStripSection>
);

/** Day status strip showing current day metadata. */
const DayStatusStrip: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const daysWithData = FORECAST_DAYS.filter((day) => hasDayOutlookData(controller.days, day)).length;
  return (
    <TabbedToolbarStripSection label="Day Status" className="tabbed-integrated-toolbar__section--day-status w-[280px]">
      <div className="flex flex-wrap items-center gap-2">
        <TabbedToolbarStatPill label="Current" value={`Day ${controller.currentDay}`} />
        <TabbedToolbarStatPill label="Data" value={`${daysWithData}/8`} />
        <TabbedToolbarStatPill label="Jump" value="1-8" />
      </div>
    </TabbedToolbarStripSection>
  );
};

/**
 * Days tab for selecting cycle date and forecast day navigation.
 */
const TabbedToolbarDaysTab: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarTabRow>
    <CycleDateStrip controller={controller} />
    <ForecastDaysStrip controller={controller} />
    <DayStatusStrip controller={controller} />
  </TabbedToolbarTabRow>
);

/** Layers tab exposing ghost layers and base map options. */
const TabbedToolbarLayersTab: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarTabRow>
    <TabbedToolbarStripSection label="Ghost Layers" hint={`Day ${controller.currentDay}`} className="tabbed-integrated-toolbar__section--ghost-layers min-w-[560px] flex-1">
      {controller.ghostTypes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {controller.ghostTypes.map((type) => {
            const isVisible = controller.ghostVisibility[type];
            const ghostColor = getGhostLayerColor(type);

            return (
              <button
                key={type}
                type="button"
                onClick={controller.ghostOutlookHandlers[type]}
                className={cn(
                  'tabbed-integrated-toolbar__ghost-layer-button relative flex h-10 min-w-[148px] items-center justify-start gap-3 rounded-xl border px-3.5 text-left transition-all',
                  isVisible
                    ? 'is-active shadow-md'
                    : 'border-border/80 bg-background text-foreground hover:border-primary/30 hover:bg-accent/60'
                )}
                style={
                  isVisible
                    ? {
                        backgroundColor: ghostColor,
                        borderColor: ghostColor,
                        color: getContrastTextColor(ghostColor),
                      }
                    : undefined
                }
              >
                <div className={cn("flex h-4 w-4 shrink-0 items-center justify-center", !isVisible && "opacity-60")}>
                  {outlookIcons[type]}
                </div>
                <div className="flex flex-row items-center gap-1.5 leading-none py-[2px] mt-[1px]">
                  <span className="text-xs font-bold leading-tight uppercase">{outlookLabels[type]}</span>
                  {!isVisible && (
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 leading-tight">
                      Hidden
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tabbed-integrated-toolbar__empty-state rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          No ghost layers are available for the current day.
        </div>
      )}
    </TabbedToolbarStripSection>

    <TabbedToolbarStripSection label="Base Map" className="tabbed-integrated-toolbar__section--base-map w-[330px]">
      <div className="flex flex-wrap items-center gap-2">
        {FORECAST_BASE_MAP_OPTIONS.map((option) => {
          const isActive = controller.baseMapStyle === option.value;
          return (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={option.label}
              onClick={() => controller.onBaseMapStyleSelect(option.value)}
              className={cn(
                'tabbed-integrated-toolbar__map-button h-10 rounded-xl border px-3 text-xs font-semibold transition-colors',
                isActive
                  ? 'is-active border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'border-border/80 bg-background text-foreground hover:border-primary/30 hover:bg-accent'
              )}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
    </TabbedToolbarStripSection>

    <OutlookTrimToolbarSection controller={controller} /><TabbedToolbarStripSection label="Layer Status" className="tabbed-integrated-toolbar__section--layer-status w-[250px]">
      <div className="flex flex-wrap items-center gap-2">
        <TabbedToolbarStatPill label="Visible" value={`${controller.visibleGhostOutlooks.length}`} />
        <TabbedToolbarStatPill label="Editing" value={outlookLabels[controller.activeOutlookType]} />
        <TabbedToolbarStatPill label="Selected" value={controller.activeProbability} />
      </div>
    </TabbedToolbarStripSection>
  </TabbedToolbarTabRow>
);

/** Tools tab exposing workspace actions, file actions, and cloud context. */
const TabbedToolbarToolsTab: React.FC<{
  controller: ForecastWorkspaceController;
  autoTstmTools?: React.ReactNode;
}> = ({ controller, autoTstmTools = null }) => {
  const actionGroups = groupTabbedToolbarActions(getTabbedToolbarActionItems(controller));

  return (
    <TabbedToolbarTabRow>
      <TabbedToolbarStripSection label="Workspace Actions" className="tabbed-integrated-toolbar__section--workspace-actions min-w-[760px] flex-1">
        <div className="tabbed-integrated-toolbar__action-groups flex flex-wrap items-center gap-2">
          <TabbedToolbarActionGroup label="History" items={actionGroups.history} />
          <TabbedToolbarActionGroup label="File" items={actionGroups.file} />
          <TabbedToolbarActionGroup label="Complete" items={actionGroups.completion} />
          <TabbedToolbarActionGroup label="Danger" items={actionGroups.destructive} tone="danger" />
        </div>
      </TabbedToolbarStripSection>

      <TabbedToolbarStripSection label="Cloud & Context" className="tabbed-integrated-toolbar__section--cloud-context w-[260px]">
        <div className="flex flex-wrap items-center gap-2">
          <TabbedToolbarStatPill label="State" value={controller.isSaved ? 'Saved' : 'Unsaved'} />
          {autoTstmTools}
          {controller.cloudTools ?? (
            <span className="text-xs font-medium text-muted-foreground">Local session only</span>
          )}
        </div>
      </TabbedToolbarStripSection>
      {isFeatureExposed('populationEstimate') ? (
        <TabbedToolbarStripSection label="Beta research" className="w-[300px]">
          <PopulationEstimateBeta />
        </TabbedToolbarStripSection>
      ) : null}
    </TabbedToolbarTabRow>
  );
};

/** Status bar for the tabbed integrated toolbar header. */
const TabbedIntegratedToolbarStatusBar: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="tabbed-integrated-toolbar__status-bar flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
    <span className="tabbed-integrated-toolbar__context-label text-[10px] font-bold uppercase tracking-[0.18em]">
      Context
      <span className="sr-only">: </span>
    </span>
    <span className="tabbed-integrated-toolbar__context-value text-foreground">
      Day {controller.currentDay}
    </span>
    <span className="tabbed-integrated-toolbar__context-separator" aria-hidden="true"> · </span>
    <span className="tabbed-integrated-toolbar__context-value text-foreground">
      {new Date(`${controller.cycleDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} Cycle
    </span>
  </div>
);

/** Header area for the tabbed integrated toolbar. */
const TabbedIntegratedToolbarHeader: React.FC<{
  controller: ForecastWorkspaceController;
  activeTab: TabbedToolbarTabKey;
  onTabChange: (value: TabbedToolbarTabKey) => void;
}> = ({ controller, activeTab, onTabChange }) => (
  <div className="tabbed-integrated-toolbar__header px-3 pt-3 lg:px-4">
    <div className="mb-[0px] flex flex-wrap items-end justify-between gap-3">
      <TabbedIntegratedToolbarTabsList activeTab={activeTab} onTabChange={onTabChange} />

      <TabbedIntegratedToolbarStatusBar controller={controller} />
    </div>
  </div>
);

/** Tray area containing the tab panels. */
const TabbedIntegratedToolbarTray: React.FC<IntegratedToolbarProps> = ({ controller, autoTstmTools }) => (
  <div className="tabbed-integrated-toolbar__tray min-h-0 flex-1 overflow-hidden bg-background px-3 py-2 lg:px-4">
    <TabsContent value="draw" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarDrawTab controller={controller} />
    </TabsContent>

    <TabsContent value="days" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarDaysTab controller={controller} />
    </TabsContent>

    <TabsContent value="layers" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarLayersTab controller={controller} />
    </TabsContent>

    <TabsContent value="tools" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarToolsTab controller={controller} autoTstmTools={autoTstmTools} />
    </TabsContent>
  </div>
);

/** Toolbar variant that keeps the original integrated-bar footprint but moves secondary controls behind tabs. */
const TabbedIntegratedToolbarBody: React.FC<IntegratedToolbarProps> = ({ controller, autoTstmTools }) => {
  const [activeTab, setActiveTab] = React.useState<TabbedToolbarTabKey>('draw');

  return (
    <div className="tabbed-integrated-toolbar shrink-0 border-t border-border/80 bg-background/95 shadow-lg h-[168px] overflow-hidden backdrop-blur">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabbedToolbarTabKey)} className="flex h-full flex-col">
        <TabbedIntegratedToolbarHeader controller={controller} activeTab={activeTab} onTabChange={setActiveTab} />
        <TabbedIntegratedToolbarTray controller={controller} autoTstmTools={autoTstmTools} />
      </Tabs>
    </div>
  );
};

/**
 * Tabbed variant of the integrated toolbar — keeps primary footprint and moves secondary controls behind tabs.
 */
export const TabbedIntegratedToolbar: React.FC<IntegratedToolbarProps> = ({ controller, autoTstmTools }) => (
  <TooltipProvider>
    <TabbedIntegratedToolbarBody controller={controller} autoTstmTools={autoTstmTools} />
  </TooltipProvider>
);
