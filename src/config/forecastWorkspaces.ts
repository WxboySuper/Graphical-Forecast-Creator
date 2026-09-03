import { isFeatureExposed, type FeatureKey } from "./featureExposure";

export type ForecastWorkspaceId = "severe" | "mesoscale" | "custom" | "tropical" | "winter";

export interface ForecastWorkspace {
  id: ForecastWorkspaceId;
  route: string;
  label: string;
  exposureKey: string | null; // null = always exposed
  production: boolean;
}

export const FORECAST_WORKSPACES: Record<ForecastWorkspaceId, ForecastWorkspace> = {
  severe: { id: "severe", route: "/forecast/severe", label: "Severe", exposureKey: null, production: true },
  mesoscale: { id: "mesoscale", route: "/forecast/mesoscale", label: "Mesoscale", exposureKey: "mesoscaleWorkspace", production: false },
  custom: { id: "custom", route: "/forecast/custom", label: "Custom", exposureKey: "customProducts", production: true },
  tropical: { id: "tropical", route: "/forecast/tropical", label: "Tropical", exposureKey: "tropicalWorkspace", production: false },
  winter: { id: "winter", route: "/forecast/winter", label: "Winter", exposureKey: "winterWorkspace", production: false },
};

/** Returns whether the workspace is available under the current feature flags. */
export const isWorkspaceExposed = (id: ForecastWorkspaceId): boolean => {
  const ws = FORECAST_WORKSPACES[id];
  if (!ws.exposureKey) return true;
  try {
    return isFeatureExposed(ws.exposureKey as FeatureKey);
  } catch {
    return false;
  }
};

/** Returns the workspaces available under the current feature flags. */
export const getExposedWorkspaces = (): ForecastWorkspace[] =>
  (Object.values(FORECAST_WORKSPACES) as ForecastWorkspace[]).filter((ws) => isWorkspaceExposed(ws.id));

/** Builds the storage key for a forecast cycle and workspace. */
export const getPersistenceKey = (cycleDate: string, workspaceId: ForecastWorkspaceId): string =>
  `gfc-forecast-cycle-v2:${cycleDate}:${workspaceId}`;

/** Returns the default workspace used when no workspace has been selected. */
export const getDefaultWorkspaceId = (): ForecastWorkspaceId => "severe";
