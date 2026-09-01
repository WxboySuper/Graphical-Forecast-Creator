import { normalizeProviderPayload } from "./contract";
import { completePayload, partialPayload, stalePayload, malformedPayload } from "./fixtures";

describe("mesoscale contract #918", () => {
  test("complete payload normalizes without losing model/cycle/validTime/unit/level", () => {
    const normalized = normalizeProviderPayload(completePayload);
    expect(normalized.model).toBe("RAP");
    expect(normalized.cycle).toBe("2026-09-01T12:00:00Z");
    expect(normalized.parameters[0].units).toBe("J/kg");
    expect(normalized.parameters[0].level).toBe("surface");
    expect(normalized.parameters[1].id).toBe("STP");
  });

  test("missing parameters are omitted, not fabricated", () => {
    const normalized = normalizeProviderPayload(partialPayload);
    expect(normalized.parameters).toHaveLength(1);
    expect(normalized.parameters[0].id).toBe("CAPE");
  });

  test("stale payload still parses (staleness is handled upstream, not rejected)", () => {
    expect(() => normalizeProviderPayload(stalePayload)).not.toThrow();
  });

  test("malformed payload fails validation", () => {
    expect(() => normalizeProviderPayload(malformedPayload)).toThrow();
  });

  test("STP/SCP pass through without local recalculation", () => {
    const stp = completePayload.parameters.find((p) => p.id === "STP");
    expect(stp?.value).toBe(2.3);
    const normalized = normalizeProviderPayload(completePayload);
    expect(normalized.parameters.find((p) => p.id === "STP")?.value).toBe(2.3);
  });
});
