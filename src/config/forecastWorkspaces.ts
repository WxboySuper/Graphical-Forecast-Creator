import type { BuildTarget } from './buildTarget';
import { getBuildTarget } from './buildTarget';
import { isFeatureExposedOnTarget, type FeatureKey } from './featureExposure';

export type ForecastWorkspaceId = 'severe' | 'mesoscale' | 'custom' | 'tropical' | 'winter';
export type ForecastWorkspaceStatus = 'available' | 'gated' | 'future';
export type ForecastWorkspaceProductType = ForecastWorkspaceId;

export interface ForecastWorkspaceDefinition {
  id: ForecastWorkspaceId;
  path: `/forecast/${ForecastWorkspaceId}`;
  label: string;
  productType: ForecastWorkspaceProductType;
  status: ForecastWorkspaceStatus;
  exposureKey: FeatureKey | null;
  legacyPaths: readonly string[];
}

/**
 * Defines the product, route, and exposure contract for every Forecast workspace.
 * Page loaders belong to the route host so unfinished workspace modules stay lazy.
 */
export const FORECAST_WORKSPACES = [
  {
    id: 'severe',
    path: '/forecast/severe',
    label: 'Severe',
    productType: 'severe',
    status: 'available',
    exposureKey: null,
    legacyPaths: ['/forecast'],
  },
  {
    id: 'mesoscale',
    path: '/forecast/mesoscale',
    label: 'Mesoscale',
    productType: 'mesoscale',
    status: 'gated',
    exposureKey: 'mesoscaleWorkspace',
    legacyPaths: [],
  },
  {
    id: 'tropical',
    path: '/forecast/tropical',
    label: 'Tropical',
    productType: 'tropical',
    status: 'future',
    exposureKey: 'tropicalWorkspace',
    legacyPaths: [],
  },
  {
    id: 'winter',
    path: '/forecast/winter',
    label: 'Winter',
    productType: 'winter',
    status: 'future',
    exposureKey: 'winterWorkspace',
    legacyPaths: [],
  },
  {
    id: 'custom',
    path: '/forecast/custom',
    label: 'Custom',
    productType: 'custom',
    status: 'gated',
    // #914 ships the route contract only: the Custom workspace stays off release
    // targets until #915 registers it. The library route keeps its own gate.
    exposureKey: 'customWorkspace',
    // /custom-products remains the separate Custom Products library route,
    // not a legacy Forecast editor route.
    legacyPaths: [],
  },
] as const satisfies readonly ForecastWorkspaceDefinition[];

export const DEFAULT_FORECAST_WORKSPACE: ForecastWorkspaceId = 'severe';

const WORKSPACES_BY_ID = new Map(
  FORECAST_WORKSPACES.map((workspace) => [workspace.id, workspace] as const),
);

const WORKSPACES_BY_PATH = new Map(
  FORECAST_WORKSPACES.map((workspace) => [workspace.path, workspace] as const),
);

const WORKSPACES_BY_LEGACY_PATH = new Map<string, ForecastWorkspaceDefinition>(
  FORECAST_WORKSPACES.flatMap((workspace) =>
    workspace.legacyPaths.map((path) => [path, workspace] as const),
  ),
);

/** Returns the registered workspace for an ID, or undefined for malformed input. */
export const getForecastWorkspace = (id: string): ForecastWorkspaceDefinition | undefined =>
  WORKSPACES_BY_ID.get(id as ForecastWorkspaceId);

/** Returns the validated workspace id, falling back to Severe for missing or unknown values. */
export const resolveForecastWorkspaceId = (workspaceId: string | undefined | null): ForecastWorkspaceId =>
  getForecastWorkspace(workspaceId ?? DEFAULT_FORECAST_WORKSPACE)?.id ?? DEFAULT_FORECAST_WORKSPACE;

/** Returns the registered workspace for a canonical path, or undefined for malformed input. */
export const getForecastWorkspaceByPath = (path: string): ForecastWorkspaceDefinition | undefined =>
  WORKSPACES_BY_PATH.get(path as `/forecast/${ForecastWorkspaceId}`);

/** Returns the registered workspace for a compatibility path, or undefined for malformed input. */
export const getForecastWorkspaceByLegacyPath = (
  path: string,
): ForecastWorkspaceDefinition | undefined => WORKSPACES_BY_LEGACY_PATH.get(path);

/** Returns whether a workspace may be registered for the selected build target. */
export const isForecastWorkspaceExposed = (
  workspace: ForecastWorkspaceDefinition,
  target: BuildTarget = getBuildTarget(),
): boolean => workspace.exposureKey === null || isFeatureExposedOnTarget(workspace.exposureKey, target);

/** Returns only workspaces whose feature exposure permits route registration. */
export const getExposedForecastWorkspaces = (
  target: BuildTarget = getBuildTarget(),
): ForecastWorkspaceDefinition[] => FORECAST_WORKSPACES.filter(
  (workspace) => isForecastWorkspaceExposed(workspace, target),
);

/** Returns the canonical Severe workspace used by legacy Forecast entry points. */
export const getDefaultForecastWorkspace = (): ForecastWorkspaceDefinition =>
  WORKSPACES_BY_ID.get(DEFAULT_FORECAST_WORKSPACE)!;
