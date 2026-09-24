import {
  getExposedForecastWorkspaces,
  resolveForecastWorkspaceId,
  type ForecastWorkspaceId,
} from '../config/forecastWorkspaces';
import { getDefaultForecastWorkspacePath } from '../routing/forecastWorkspaceRoutes';
import type { BuildTarget } from '../config/buildTarget';
import type { CloudCycleMetadata } from '../types/cloudCycles';

export type CloudLibraryTabId = 'all' | ForecastWorkspaceId;

export interface CloudLibraryTab {
  id: CloudLibraryTabId;
  label: string;
  cycleCount: number;
}

/** Reads a shareable workspace tab from the cloud-library query string. */
export const getCloudLibraryTabFromSearchParams = (
  searchParams: URLSearchParams,
  tabs: readonly CloudLibraryTab[],
): CloudLibraryTabId => {
  const requestedTab = searchParams.get('workspace');
  return tabs.some((tab) => tab.id === requestedTab) ? (requestedTab as CloudLibraryTabId) : 'all';
};

/** Resolves legacy or malformed cloud metadata to the Severe workspace boundary. */
export const getCloudCycleWorkspaceId = (cycle: Pick<CloudCycleMetadata, 'workspaceId'>): ForecastWorkspaceId =>
  resolveForecastWorkspaceId(cycle.workspaceId);

/** Resolves the display label for one cycle, mapping legacy records to Severe. */
export const getCloudCycleWorkspaceLabel = (cycle: Pick<CloudCycleMetadata, 'workspaceId'>): string =>
  getForecastWorkspace(getCloudCycleWorkspaceId(cycle))?.label ?? 'Severe';

/** Returns the cycles owned by one workspace, treating legacy records as Severe. */
export const filterCloudCyclesByWorkspace = (
  cycles: CloudCycleMetadata[],
  tabId: CloudLibraryTabId,
): CloudCycleMetadata[] =>
  tabId === 'all' ? cycles : cycles.filter((cycle) => getCloudCycleWorkspaceId(cycle) === tabId);

/** Resolves the display label for one tab, undefined for the combined All view. */
export const getCloudLibraryTabLabel = (
  tabs: CloudLibraryTab[],
  tabId: CloudLibraryTabId,
): string | undefined =>
  tabId === 'all' ? undefined : tabs.find((tab) => tab.id === tabId)?.label;

/** Resolves the editor route for one tab, keeping Custom on its legacy path. */
export const getCloudLibraryWorkspacePath = (tabId: CloudLibraryTabId): string => {
  if (tabId === 'all') return getDefaultForecastWorkspacePath();
  const workspace = getForecastWorkspace(tabId);
  if (!workspace) return getDefaultForecastWorkspacePath();
  if (workspace.id === 'custom') {
    return workspace.legacyPaths[0] ?? getDefaultForecastWorkspacePath();
  }
  return workspace.status === 'available' ? workspace.path : getDefaultForecastWorkspacePath();
};

/** Resolves Home and End navigation, or undefined when the key is not an edge key. */
const getCloudLibraryEdgeTabId = (
  tabs: CloudLibraryTab[],
  key: string,
): CloudLibraryTabId | null | undefined => {
  if (key === 'Home') return tabs[0]?.id ?? null;
  if (key === 'End') return tabs[tabs.length - 1]?.id ?? null;
  return undefined;
};

/** Resolves Arrow navigation with wrapping, or null when the key does not move. */
const getCloudLibraryArrowTabId = (
  tabs: CloudLibraryTab[],
  currentId: CloudLibraryTabId,
  key: string,
): CloudLibraryTabId | null => {
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;

  const currentIndex = tabs.findIndex((tab) => tab.id === currentId);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  const offset = key === 'ArrowRight' ? 1 : -1;
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
  return getCloudLibraryArrowTabId(tabs, currentId, key);
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
