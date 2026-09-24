import {
  DEFAULT_FORECAST_WORKSPACE,
  getExposedForecastWorkspaces,
  getForecastWorkspace,
  type ForecastWorkspaceId,
} from '../config/forecastWorkspaces';
import type { BuildTarget } from '../config/buildTarget';
import type { CloudCycleMetadata } from '../types/cloudCycles';

export type CloudLibraryTabId = 'all' | ForecastWorkspaceId;

export interface CloudLibraryTab {
  id: CloudLibraryTabId;
  label: string;
  cycleCount: number;
}

/** Resolves legacy or malformed cloud metadata to the Severe workspace boundary. */
export const getCloudCycleWorkspaceId = (cycle: Pick<CloudCycleMetadata, 'workspaceId'>): ForecastWorkspaceId =>
  getForecastWorkspace(cycle.workspaceId ?? DEFAULT_FORECAST_WORKSPACE)?.id ?? DEFAULT_FORECAST_WORKSPACE;

/** Resolves the display label for one cycle, mapping legacy records to Severe. */
export const getCloudCycleWorkspaceLabel = (cycle: Pick<CloudCycleMetadata, 'workspaceId'>): string =>
  getForecastWorkspace(getCloudCycleWorkspaceId(cycle))?.label ?? 'Severe';

/** Returns the cycles owned by one workspace, treating legacy records as Severe. */
export const filterCloudCyclesByWorkspace = (
  cycles: CloudCycleMetadata[],
  tabId: CloudLibraryTabId,
): CloudCycleMetadata[] =>
  tabId === 'all' ? cycles : cycles.filter((cycle) => getCloudCycleWorkspaceId(cycle) === tabId);

/** Returns the active tab when still present, otherwise falls back to All. */
export const resolveActiveCloudLibraryTab = (
  tabs: CloudLibraryTab[],
  activeTab: CloudLibraryTabId,
): CloudLibraryTabId =>
  tabs.some((tab) => tab.id === activeTab) ? activeTab : 'all';

/** Resolves the next tab for one keyboard command, or null when the key does nothing. */
export const getNextCloudLibraryTabId = (
  tabs: CloudLibraryTab[],
  currentId: CloudLibraryTabId,
  key: string,
): CloudLibraryTabId | null => {
  if (tabs.length === 0) return null;
  if (key === 'Home') return tabs[0]?.id ?? null;
  if (key === 'End') return tabs[tabs.length - 1]?.id ?? null;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;

  const currentIndex = tabs.findIndex((tab) => tab.id === currentId);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  const offset = key === 'ArrowRight' ? 1 : -1;
  return tabs[(safeIndex + offset + tabs.length) % tabs.length]?.id ?? null;
};

/** Builds stable library tabs from the exposed, non-future workspace registry. */
export const getCloudLibraryTabs = (
  cycles: CloudCycleMetadata[],
  target: BuildTarget,
): CloudLibraryTab[] => {
  const tabs: CloudLibraryTab[] = [{ id: 'all', label: 'All', cycleCount: cycles.length }];

  for (const workspace of getExposedForecastWorkspaces(target)) {
    if (workspace.status === 'future') continue;
    tabs.push({
      id: workspace.id,
      label: workspace.label,
      cycleCount: filterCloudCyclesByWorkspace(cycles, workspace.id).length,
    });
  }

  return tabs;
};
