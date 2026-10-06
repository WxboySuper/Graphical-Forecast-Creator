import type { BuildTarget } from '../config/buildTarget';
import {
  DEFAULT_FORECAST_WORKSPACE,
  FORECAST_WORKSPACES,
  getForecastWorkspace,
  getForecastWorkspaceByPath,
  getExposedForecastWorkspaces,
  isForecastWorkspaceExposed,
  type ForecastWorkspaceDefinition,
  type ForecastWorkspaceId,
} from '../config/forecastWorkspaces';

export { DEFAULT_FORECAST_WORKSPACE, FORECAST_WORKSPACES };
export type { ForecastWorkspaceDefinition, ForecastWorkspaceId };

/** Returns the canonical route for a registered workspace. */
export const getForecastWorkspacePath = (workspaceId: ForecastWorkspaceId): string =>
  getForecastWorkspace(workspaceId)!.path;

/** Returns the canonical Severe route used by the legacy /forecast redirect. */
export const getDefaultForecastWorkspacePath = (): string =>
  getForecastWorkspacePath(DEFAULT_FORECAST_WORKSPACE);

/** Strips trailing slashes so canonical matching tolerates bookmarked URLs. */
export const normalizeForecastWorkspacePath = (path: string): string => {
  if (path.length > 1) {
    const normalized = path.replace(/\/+$/, '');
    return normalized === '' ? '/' : normalized;
  }
  return path;
};

/** Resolves a canonical workspace route without applying exposure rules. */
export const resolveForecastWorkspacePath = (path: string): ForecastWorkspaceDefinition | undefined =>
  getForecastWorkspaceByPath(normalizeForecastWorkspacePath(path));

/** Resolves a canonical workspace route only when its build target exposes it. */
export const resolveExposedForecastWorkspacePath = (
  path: string,
  target?: BuildTarget,
): ForecastWorkspaceDefinition | undefined => {
  const workspace = resolveForecastWorkspacePath(path);
  return workspace && isForecastWorkspaceExposed(workspace, target) ? workspace : undefined;
};

/** Resolves a legacy path to its owning workspace without applying exposure rules. */
export const resolveLegacyForecastWorkspacePath = (path: string): ForecastWorkspaceDefinition | undefined =>
  FORECAST_WORKSPACES.find((workspace) =>
    (workspace.legacyPaths as readonly string[]).includes(normalizeForecastWorkspacePath(path)),
  );

/** Resolves a legacy path to its owning workspace only when its build target exposes it. */
export const resolveExposedLegacyForecastWorkspacePath = (
  path: string,
  target?: BuildTarget,
): ForecastWorkspaceDefinition | undefined => {
  const workspace = resolveLegacyForecastWorkspacePath(path);
  return workspace && isForecastWorkspaceExposed(workspace, target) ? workspace : undefined;
};

/** Resolves the owning workspace for a forecast route, or undefined for non-forecast pages. */
export const resolveRouteForecastWorkspace = (
  path: string,
  target?: BuildTarget,
): ForecastWorkspaceDefinition | undefined =>
  resolveExposedForecastWorkspacePath(path, target)
  ?? resolveExposedLegacyForecastWorkspacePath(path, target);

/** Returns canonical workspace routes that may be registered for a build target. */
export const getExposedForecastWorkspacePaths = (target?: BuildTarget): string[] =>
  getExposedForecastWorkspaces(target).map((workspace) => workspace.path);

export interface ForecastWorkspaceRoute {
  id: ForecastWorkspaceId;
  path: `/forecast/${ForecastWorkspaceId}`;
  routePath: ForecastWorkspaceId;
}

/** Returns validated route records for workspaces that may be registered for a build target. */
export const getExposedForecastWorkspaceRoutes = (target?: BuildTarget): ForecastWorkspaceRoute[] =>
  getExposedForecastWorkspaces(target)
    .filter((workspace) => getForecastWorkspace(workspace.id)?.id === workspace.id)
    .filter((workspace) => getForecastWorkspaceByPath(workspace.path)?.id === workspace.id)
    .map((workspace) => ({ id: workspace.id, path: workspace.path, routePath: workspace.id }));

/** A workspace has a usable editor only when this build target registers its route. */
export const isForecastWorkspaceRouteAvailable = (
  workspaceId: ForecastWorkspaceId,
  workspace: ForecastWorkspaceDefinition | undefined,
  target?: BuildTarget,
): boolean => {
  if (!workspace || workspace.id !== workspaceId) {
    return false;
  }
  if (!isForecastWorkspaceExposed(workspace, target)) {
    return false;
  }
  return getExposedForecastWorkspaceRoutes(target).some((route) => route.id === workspaceId);
};

/** A workspace can open cloud payloads only when it has a registered editor route for the target. */
export const isSupportedCloudLoadWorkspace = (
  workspaceId: ForecastWorkspaceId,
  workspace: ForecastWorkspaceDefinition | undefined,
  target?: BuildTarget,
): boolean => isForecastWorkspaceRouteAvailable(workspaceId, workspace, target);

/** Resolves a known workspace route only when its build target does not expose it. */
export const resolveUnavailableForecastWorkspacePath = (
  path: string,
  target?: BuildTarget,
): ForecastWorkspaceDefinition | undefined => {
  const workspace = resolveForecastWorkspacePath(path);
  return workspace && !isForecastWorkspaceExposed(workspace, target) ? workspace : undefined;
};

/** Returns validated route records for known but unexposed workspaces. */
export const getUnavailableForecastWorkspaceRoutes = (target?: BuildTarget): ForecastWorkspaceRoute[] =>
  FORECAST_WORKSPACES.filter((workspace) => !isForecastWorkspaceExposed(workspace, target))
    .filter((workspace) => getForecastWorkspace(workspace.id)?.id === workspace.id)
    .filter((workspace) => getForecastWorkspaceByPath(workspace.path)?.id === workspace.id)
    .map((workspace) => ({ id: workspace.id, path: workspace.path, routePath: workspace.id }));
