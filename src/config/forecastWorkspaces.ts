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
  description: string;
  focus: readonly string[];
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
    description: 'Create outlooks for severe weather threats.',
    focus: ['Categorical and probability outlooks', 'Tornado, wind, and hail risks'],
    productType: 'severe',
    status: 'available',
    exposureKey: null,
    legacyPaths: ['/forecast'],
  },
  {
    id: 'mesoscale',
    path: '/forecast/mesoscale',
    label: 'Mesoscale',
    description: 'Build short-range forecasts for focused weather events.',
    focus: ['Storm-scale hazards', 'Short-term event evolution'],
    productType: 'mesoscale',
    status: 'future',
    exposureKey: null,
    legacyPaths: [],
  },
  {
    id: 'tropical',
    path: '/forecast/tropical',
    label: 'Tropical',
    description: 'Plan forecasts for tropical cyclones and their impacts.',
    focus: ['Track and intensity outlooks', 'Wind, rain, and surge impacts'],
    productType: 'tropical',
    status: 'future',
    exposureKey: null,
    legacyPaths: [],
  },
  {
    id: 'winter',
    path: '/forecast/winter',
    label: 'Winter',
    description: 'Forecast winter weather types and expected impacts.',
    focus: ['Snow, ice, and mixed precipitation', 'Accumulation and impact outlooks'],
    productType: 'winter',
    status: 'future',
    exposureKey: null,
    legacyPaths: [],
  },
  {
    id: 'custom',
    path: '/forecast/custom',
    label: 'Custom',
    description: 'Create forecasts with custom products and layers.',
    focus: ['Custom forecast layers', 'Product-specific categories'],
    productType: 'custom',
    status: 'gated',
    // Custom editing remains limited to local and beta. The library route keeps
    // its independent customProducts gate.
    exposureKey: 'customWorkspace',
    // /custom-products remains the separate Custom Products library route,
    // not a legacy Forecast editor route.
    legacyPaths: [],
  },
] as const satisfies readonly ForecastWorkspaceDefinition[];

export const DEFAULT_FORECAST_WORKSPACE: ForecastWorkspaceId = 'severe';

/** Custom editing is active only when the route and both rollout flags agree. */
export const isCustomWorkspaceActive = (
  workspaceId: string,
  customProductsExposed: boolean,
  customWorkspaceExposed: boolean,
): boolean => workspaceId === 'custom' && customProductsExposed && customWorkspaceExposed;

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

/**
 * Returns a registered workspace ID or throws. Callers write payloads from
 * values that reach them at runtime, where the ForecastWorkspaceId type checks
 * nothing, so every save and export path resolves ownership here first.
 */
export const requireForecastWorkspaceId = (workspaceId: unknown): ForecastWorkspaceId => {
  if (typeof workspaceId !== 'string' || !WORKSPACES_BY_ID.has(workspaceId as ForecastWorkspaceId)) {
    throw new Error('Cannot save or export a forecast without a valid workspace.');
  }
  return workspaceId as ForecastWorkspaceId;
};

/**
 * Resolves a workspace id read back from stored metadata.
 *
 * An absent id belongs to a record written before workspaces existed, so it stays
 * on the default. An id this build does not register has no usable owner, so it
 * returns null instead of being relabeled as the default; callers must treat null
 * as "do not open, do not write back".
 */
export const resolveStoredWorkspaceId = (workspaceId: unknown): ForecastWorkspaceId | null => {
  if (workspaceId === undefined || workspaceId === null) return DEFAULT_FORECAST_WORKSPACE;
  return typeof workspaceId === 'string' ? WORKSPACES_BY_ID.get(workspaceId as ForecastWorkspaceId)?.id ?? null : null;
};

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
): boolean => {
  if (workspace.status === 'future') {
    return false;
  }

  if (workspace.status === 'gated') {
    return workspace.exposureKey !== null && isFeatureExposedOnTarget(workspace.exposureKey, target);
  }

  return workspace.exposureKey === null || isFeatureExposedOnTarget(workspace.exposureKey, target);
};

/** Returns only workspaces whose feature exposure permits route registration. */
export const getExposedForecastWorkspaces = (
  target: BuildTarget = getBuildTarget(),
): ForecastWorkspaceDefinition[] => FORECAST_WORKSPACES.filter(
  (workspace) => isForecastWorkspaceExposed(workspace, target),
);

/** Returns the canonical Severe workspace used by legacy Forecast entry points. */
export const getDefaultForecastWorkspace = (): ForecastWorkspaceDefinition =>
  WORKSPACES_BY_ID.get(DEFAULT_FORECAST_WORKSPACE)!;
