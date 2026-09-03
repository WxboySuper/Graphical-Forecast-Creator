import { isFeatureExposed, type FeatureKey } from "./featureExposure";

export type ForecastWorkspaceId = "severe" | "mesoscale" | "custom" | "tropical" | "winter";

export interface ForecastWorkspace {
  id: ForecastWorkspaceId;
  route: string;
  label: string;
  exposureKey: FeatureKey | null;
}

export const FORECAST_WORKSPACES: Record<ForecastWorkspaceId, ForecastWorkspace> = {
  severe: { id: "severe", route: "/forecast/severe", label: "Severe", exposureKey: null },
  mesoscale: { id: "mesoscale", route: "/forecast/mesoscale", label: "Mesoscale", exposureKey: "mesoscaleWorkspace" },
  custom: { id: "custom", route: "/forecast/custom", label: "Custom", exposureKey: "customProducts" },
  tropical: { id: "tropical", route: "/forecast/tropical", label: "Tropical", exposureKey: "tropicalWorkspace" },
  winter: { id: "winter", route: "/forecast/winter", label: "Winter", exposureKey: "winterWorkspace" },
};

/** Throws when a cycle date is not a real ISO calendar date. */
const assertValidCycleDate = (cycleDate: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) {
    throw new Error(`Invalid cycle date ${JSON.stringify(cycleDate)}.`);
  }

  const [year, month, day] = cycleDate.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  const actualParts = [
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate(),
  ];
  const expectedParts = [year, month - 1, day];

  if (actualParts.some((part, index) => part !== expectedParts[index])) {
    throw new Error(`Invalid cycle date ${JSON.stringify(cycleDate)}.`);
  }
};

/** Returns whether the workspace is available under the current feature flags. */
export const isWorkspaceExposed = (id: ForecastWorkspaceId): boolean => {
  const ws = FORECAST_WORKSPACES[id];
  if (!ws) return false;
  if (ws.exposureKey === null) return true;
  return isFeatureExposed(ws.exposureKey);
};

/** Returns the workspaces available under the current feature flags. */
export const getExposedWorkspaces = (): ForecastWorkspace[] =>
  (Object.values(FORECAST_WORKSPACES) as ForecastWorkspace[]).filter((ws) => isWorkspaceExposed(ws.id));

/** Builds the storage key for a forecast cycle and workspace. */
export const getPersistenceKey = (cycleDate: string, workspaceId: ForecastWorkspaceId): string => {
  assertValidCycleDate(cycleDate);
  return `gfc-forecast-cycle-v2:${cycleDate}:${workspaceId}`;
};

/** Returns the default workspace used when no workspace has been selected. */
export const getDefaultWorkspaceId = (): ForecastWorkspaceId => "severe";
