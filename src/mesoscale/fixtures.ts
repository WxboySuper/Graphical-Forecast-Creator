export const completePayload = {
  model: "RAP" as const,
  cycle: "2026-09-01T12:00:00Z",
  domain: "CONUS",
  source: "provider-rap",
  generatedAt: "2026-09-01T12:15:00Z",
  parameters: [
    {
      id: "CAPE",
      displayName: "Mixed-Layer CAPE",
      units: "J/kg",
      level: "surface",
      mapDisplayType: "fill" as const,
      value: 1250,
      validTime: "2026-09-01T18:00:00Z",
      forecastHour: 6,
      model: "RAP" as const,
      cycle: "2026-09-01T12:00:00Z",
      domain: "CONUS",
      source: "provider-rap",
    },
    {
      id: "STP",
      displayName: "Significant Tornado Parameter",
      units: "",
      level: "surface",
      mapDisplayType: "fill" as const,
      value: 2.3,
      validTime: "2026-09-01T18:00:00Z",
      forecastHour: 6,
      model: "RAP" as const,
      cycle: "2026-09-01T12:00:00Z",
      domain: "CONUS",
      source: "provider-rap",
    },
  ],
};

export const partialPayload = {
  ...completePayload,
  parameters: [completePayload.parameters[0]], // only CAPE, STP missing → should be omitted/null
};

export const stalePayload = {
  ...completePayload,
  generatedAt: "2026-08-31T00:00:00Z", // stale
};

export const malformedPayload = {
  model: "RAP",
  cycle: "not-a-date", // invalid
  domain: "CONUS",
  source: "provider-rap",
  generatedAt: "2026-09-01T12:15:00Z",
  parameters: [],
};

// Test helper: validate that ProviderPayloadSchema handles these
export const fixtures = { completePayload, partialPayload, stalePayload, malformedPayload };
