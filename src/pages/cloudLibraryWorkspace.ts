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
  getForecastWorkspace(cycle.workspaceId ?? DEFAULT_FORECAST_WORKSPACE)?.id ?? DEFAULT_FORECAST_WORKSPACE;

/** Returns the cycles owned by one workspace, treating legacy records as Severe. */
export const filterCloudCyclesByWorkspace = (
  cycles: CloudCycleMetadata[],
  tabId: CloudLibraryTabId,
): CloudCycleMetadata[] =>
  tabId === 'all' ? cycles : cycles.filter((cycle) => getCloudCycleWorkspaceId(cycle) === tabId);

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
