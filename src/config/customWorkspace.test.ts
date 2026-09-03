import { getCustomWorkspaceRoute, isCustomWorkspaceExposed, getCustomWorkspaceLabel, isCustomContentInCycle } from "./customWorkspace";

describe("customWorkspace #915", () => {
  test("custom workspace route is /forecast/custom", () => {
    expect(getCustomWorkspaceRoute()).toBe("/forecast/custom");
  });

  test("custom workspace label is Custom", () => {
    expect(getCustomWorkspaceLabel()).toBe("Custom");
  });

  test("isCustomWorkspaceExposed returns boolean", () => {
    expect(typeof isCustomWorkspaceExposed()).toBe("boolean");
  });

  test("detects custom content in cycle", () => {
    expect(isCustomContentInCycle({ days: { "1": { customLayers: { layers: [] } } } as never })).toBe(true);
    expect(isCustomContentInCycle({ days: { "1": {} } as never })).toBe(false);
  });
});
