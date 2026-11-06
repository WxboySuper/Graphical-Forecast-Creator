import React from 'react';
import {
  ArrowDownUp,
  CheckCircle,
  Copy,
  History,
  Image as ImageIcon,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { isFeatureExposed } from '../../config/featureExposure';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';

export interface TabbedToolbarActionItem {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'outline' | 'destructive';
  tone: 'utility' | 'primary' | 'danger';
  accentClass: string;
}

/** Returns the action items displayed in the Tools tab. */
export const getTabbedToolbarActionItems = (
  controller: ForecastWorkspaceController,
): TabbedToolbarActionItem[] => [
  {
    key: 'undo',
    label: 'Undo',
    description: 'Ctrl/Cmd+Z',
    icon: <Undo2 className="h-4 w-4" />,
    onClick: controller.onUndo,
    disabled: !controller.canUndo,
    tone: 'utility',
    accentClass: 'bg-amber-500/15 text-amber-700',
  },
  {
    key: 'redo',
    label: 'Redo',
    description: 'Ctrl/Cmd+Y',
    icon: <Redo2 className="h-4 w-4" />,
    onClick: controller.onRedo,
    disabled: !controller.canRedo,
    tone: 'utility',
    accentClass: 'bg-amber-500/15 text-amber-700',
  },
  {
    key: 'transfer',
    label: 'Import / Export',
    description: 'JSON, package, KML, and KMZ',
    icon: <ArrowDownUp className="h-4 w-4" />,
    onClick: () => controller.onOpenTransferModal('export'),
    disabled: controller.isTransferBusy,
    tone: 'primary',
    accentClass: 'bg-emerald-500/15 text-emerald-700',
  },
  {
    key: 'export-image',
    label: 'Map image',
    description: 'Ctrl/Cmd+E',
    icon: <ImageIcon className="h-4 w-4" />,
    onClick: controller.onInitiateExport,
    disabled: controller.isExporting,
    tone: 'primary',
    accentClass: 'bg-orange-500/15 text-orange-700',
  },
  {
    key: 'history',
    label: 'History',
    description: 'Reopen saved sessions',
    icon: <History className="h-4 w-4" />,
    onClick: controller.onOpenHistoryModal,
    tone: 'utility',
    accentClass: 'bg-cyan-500/15 text-cyan-700',
  },
  {
    key: 'copy',
    label: 'Copy',
    description: 'Pull from another day',
    icon: <Copy className="h-4 w-4" />,
    onClick: controller.onOpenCopyModal,
    tone: 'utility',
    accentClass: 'bg-teal-500/15 text-teal-700',
  },
  ...(isFeatureExposed('forecastWorkflowV2')
    ? [{
        key: 'complete',
        label: 'Complete',
        description: 'Validate and complete cycle',
        icon: <CheckCircle className="h-4 w-4" />,
        onClick: controller.onOpenCompletionModal,
        tone: 'primary' as const,
        accentClass: 'bg-emerald-500/15 text-emerald-700',
      }]
    : []),
  {
    key: 'reset',
    label: 'Reset All',
    description: 'Clear every polygon',
    icon: <Trash2 className="h-4 w-4" />,
    onClick: controller.onOpenResetConfirm,
    variant: 'destructive',
    tone: 'danger',
    accentClass: 'bg-red-500/15 text-red-700',
  },
];

/** Renders one workspace action tile in the Tools tab. */
export const TabbedToolbarActionTile: React.FC<{ item: TabbedToolbarActionItem }> = ({ item }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={item.variant ?? 'outline'}
        className={cn(
          'tabbed-integrated-toolbar__action-tile h-10 shrink-0 justify-start rounded-xl px-2.5 text-left text-xs',
          item.variant !== 'destructive' && 'bg-background',
          item.tone === 'utility' && 'tabbed-integrated-toolbar__action-tile--utility',
          item.tone === 'primary' && 'tabbed-integrated-toolbar__action-tile--primary',
          item.tone === 'danger' && 'tabbed-integrated-toolbar__action-tile--danger',
        )}
        onClick={item.onClick}
        disabled={item.disabled}
      >
        <span className={cn('tabbed-integrated-toolbar__action-icon rounded-lg p-1.5', item.accentClass)}>{item.icon}</span>
        <span className="font-semibold">{item.label}</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{item.description}</p>
    </TooltipContent>
  </Tooltip>
);

/** Groups related action tiles under one Tools-tab label. */
export const TabbedToolbarActionGroup: React.FC<{
  label: string;
  items: TabbedToolbarActionItem[];
  tone?: 'default' | 'danger';
}> = ({ label, items, tone = 'default' }) => {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'tabbed-integrated-toolbar__action-group flex items-center gap-2',
        tone === 'danger' && 'tabbed-integrated-toolbar__action-group--danger',
      )}
    >
      <span className="tabbed-integrated-toolbar__action-group-label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => <TabbedToolbarActionTile key={item.key} item={item} />)}
      </div>
    </div>
  );
};
