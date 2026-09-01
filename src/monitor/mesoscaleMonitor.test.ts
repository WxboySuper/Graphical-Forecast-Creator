import { getMesoscaleLayerConfig, isMesoscaleLayerEnabled, isMonitorMesoscaleAvailable } from "./mesoscaleMonitor";
import { completePayload } from "../mesoscale/fixtures";

describe("mesoscaleMonitor #921", () => {
  test("layer config from param has enabled false when value null", () => {
    const param = { ...completePayload.parameters[0], value: null as number | null };
    const layer = getMesoscaleLayerConfig(param);
    expect(isMesoscaleLayerEnabled(layer)).toBe(false);
  });

  test("layer config enabled when value present", () => {
    const layer = getMesoscaleLayerConfig(completePayload.parameters[0]);
    expect(isMesoscaleLayerEnabled(layer)).toBe(true);
  });

  test("monitor mesoscale available when any param has value", () => {
    expect(isMonitorMesoscaleAvailable(completePayload.parameters)).toBe(true);
    expect(isMonitorMesoscaleAvailable([])).toBe(false);
  });

  test("layer id is namespaced", () => {
    const layer = getMesoscaleLayerConfig(completePayload.parameters[0]);
    expect(layer.id).toBe("mesoscale-CAPE-6");
  });
});
