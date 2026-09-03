import {
  FORECAST_WORKSPACES,
  isWorkspaceExposed,
  getExposedWorkspaces,
  getPersistenceKey,
  getDefaultWorkspaceId,
} from "./forecastWorkspaces";
import { BUILD_TARGETS, type BuildTarget } from "./buildTarget";

describe("forecastWorkspaces #914", () => {
  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = "local";
  });

  test.each(BUILD_TARGETS)("exposes the expected workspace matrix on %s", (target: BuildTarget) => {
    globalThis.__GFC_BUILD_TARGET__ = target;

    expect(Object.keys(FORECAST_WORKSPACES)).toEqual([
      "severe",
      "mesoscale",
      "custom",
      "tropical",
      "winter",
    ]);
    expect(isWorkspaceExposed("severe")).toBe(true);
    expect(isWorkspaceExposed("mesoscale")).toBe(false);
    expect(isWorkspaceExposed("tropical")).toBe(false);
    expect(isWorkspaceExposed("winter")).toBe(false);
    expect(isWorkspaceExposed("custom")).toBe(true);
  });

  test("exposed workspaces includes only enabled workspaces", () => {
    expect(getExposedWorkspaces().map((workspace) => workspace.id)).toEqual(["severe", "custom"]);
  });

  test("returns false for an unknown workspace at runtime", () => {
    expect(isWorkspaceExposed("unknown" as never)).toBe(false);
  });

  test("persistence key is namespaced by cycleDate and workspaceId", () => {
    expect(getPersistenceKey("2026-09-01", "severe")).toBe("gfc-forecast-cycle-v2:2026-09-01:severe");
    expect(getPersistenceKey("2026-09-01", "mesoscale")).toBe("gfc-forecast-cycle-v2:2026-09-01:mesoscale");
    expect(() => getPersistenceKey("", "severe")).toThrow("Invalid cycle date");
    expect(() => getPersistenceKey("2026-02-30", "severe")).toThrow("Invalid cycle date");
  });

  test("default workspace is severe", () => {
    expect(getDefaultWorkspaceId()).toBe("severe");
  });

  test("routes are canonical", () => {
    expect(Object.values(FORECAST_WORKSPACES).map((workspace) => workspace.route)).toEqual([
      "/forecast/severe",
      "/forecast/mesoscale",
      "/forecast/custom",
      "/forecast/tropical",
      "/forecast/winter",
    ]);
  });
});
