import type { BuildTarget } from '../config/buildTarget';
import {
  DEFAULT_FORECAST_WORKSPACE,
  FORECAST_WORKSPACES,
  getForecastWorkspace,
  getForecastWorkspaceByPath,
  getExposedForecastWorkspaces,
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

/** Resolves a canonical workspace route without applying exposure rules. */
export const resolveForecastWorkspacePath = (path: string): ForecastWorkspaceDefinition | undefined =>
  getForecastWorkspaceByPath(path);

/** Resolves a legacy path to its owning workspace without applying exposure rules. */
export const resolveLegacyForecastWorkspacePath = (path: string): ForecastWorkspaceDefinition | undefined =>
  FORECAST_WORKSPACES.find((workspace) => (workspace.legacyPaths as readonly string[]).includes(path));

/** Returns canonical workspace routes that may be registered for a build target. */
export const getExposedForecastWorkspacePaths = (target?: BuildTarget): string[] =>
  getExposedForecastWorkspaces(target).map((workspace) => workspace.path);
