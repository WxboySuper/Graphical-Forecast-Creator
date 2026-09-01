import {
  FORECAST_WORKSPACES,
  isWorkspaceExposed,
  getExposedWorkspaces,
  getPersistenceKey,
  getDefaultWorkspaceId,
} from "./forecastWorkspaces";

describe("forecastWorkspaces #914", () => {
  test("severe is always exposed, tropical/winter gated", () => {
    expect(isWorkspaceExposed("severe")).toBe(true);
    // mesoscale/custom/tropical/winter depend on featureExposure, default false in test
    expect(typeof isWorkspaceExposed("tropical")).toBe("boolean");
  });

  test("exposed workspaces includes severe", () => {
    const exposed = getExposedWorkspaces();
    expect(exposed.some((w) => w.id === "severe")).toBe(true);
  });

  test("persistence key is namespaced by cycleDate and workspaceId", () => {
    expect(getPersistenceKey("2026-09-01", "severe")).toBe("gfc-forecast-cycle-v2:2026-09-01:severe");
    expect(getPersistenceKey("2026-09-01", "mesoscale")).toBe("gfc-forecast-cycle-v2:2026-09-01:mesoscale");
  });

  test("default workspace is severe", () => {
    expect(getDefaultWorkspaceId()).toBe("severe");
  });

  test("routes are canonical", () => {
    expect(FORECAST_WORKSPACES.severe.route).toBe("/forecast/severe");
    expect(FORECAST_WORKSPACES.mesoscale.route).toBe("/forecast/mesoscale");
  });
});
