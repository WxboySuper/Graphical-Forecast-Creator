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

/** Returns the edge tab for Home/End, or undefined when the key is not an edge key. */
const getCloudLibraryEdgeTabId = (
  tabs: CloudLibraryTab[],
  key: string,
): CloudLibraryTabId | null | undefined => {
  if (key === 'Home') return tabs[0]?.id ?? null;
  if (key === 'End') return tabs[tabs.length - 1]?.id ?? null;
  return undefined;
};

/** Returns the step for Arrow keys, or null when the key does not move focus. */
const getCloudLibraryArrowOffset = (key: string): 1 | -1 | null => {
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  return null;
};

/** Returns the wrapped tab after one Arrow step, falling back to the first tab. */
const getCloudLibraryArrowTabId = (
  tabs: CloudLibraryTab[],
  currentId: CloudLibraryTabId,
  offset: 1 | -1,
): CloudLibraryTabId | null => {
  const currentIndex = tabs.findIndex((tab) => tab.id === currentId);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  return tabs[(safeIndex + offset + tabs.length) % tabs.length]?.id ?? null;
};

/** Resolves the next tab for one keyboard command, or null when the key does nothing. */
export const getNextCloudLibraryTabId = (
  tabs: CloudLibraryTab[],
  currentId: CloudLibraryTabId,
  key: string,
): CloudLibraryTabId | null => {
  if (tabs.length === 0) return null;
  const edgeTabId = getCloudLibraryEdgeTabId(tabs, key);
  if (edgeTabId !== undefined) return edgeTabId;
  const offset = getCloudLibraryArrowOffset(key);
  if (offset === null) return null;
  return getCloudLibraryArrowTabId(tabs, currentId, offset);
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
