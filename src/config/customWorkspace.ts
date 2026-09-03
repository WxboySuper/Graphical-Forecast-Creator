import { isFeatureExposed } from "./featureExposure";
import { FORECAST_WORKSPACES } from "./forecastWorkspaces";

export const getCustomWorkspaceRoute = (): string => FORECAST_WORKSPACES.custom.route;

export const isCustomWorkspaceExposed = (): boolean => {
  try {
    return isFeatureExposed("customProducts");
  } catch {
    return false;
  }
};

export const getCustomWorkspaceLabel = (): string => FORECAST_WORKSPACES.custom.label;

export const isCustomContentInCycle = (cycle: { days: Record<string, { customLayers?: unknown }> }): boolean =>
  Object.values(cycle.days).some((d) => !!d.customLayers);
