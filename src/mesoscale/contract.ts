/**
 * #918 Provider-supplied mesoscale parameter contract (slice 1)
 * Normalized client contract for RAP/HRRR provider fields.
 * No GFC-side meteorological calculations — passthrough only.
 * Minimal validation without zod — uses runtime checks to keep green without new deps.
 */

export type Model = "RAP" | "HRRR" | "GFS";
export type ForecastHour = number; // 0-48

export interface MesoscaleParameter {
  id: string; // e.g., "CAPE", "STP"
  displayName: string;
  units: string; // "" allowed for dimensionless
  level: string;
  scale?: string;
  legend?: { min: number; max: number; colors: string[] };
  mapDisplayType: "contour" | "fill" | "vector";
  value: number | null; // null = unavailable
  validTime: string; // ISO datetime
  forecastHour: ForecastHour;
  model: Model;
  cycle: string; // ISO cycle
  domain: string;
  source: string;
}

export interface ProviderPayload {
  model: Model;
  cycle: string;
  domain: string;
  source: string;
  generatedAt: string;
  parameters: MesoscaleParameter[];
  warnings?: string[];
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CYCLE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;

const isModel = (v: unknown): v is Model => v === "RAP" || v === "HRRR" || v === "GFS";

export const normalizeProviderPayload = (raw: unknown): ProviderPayload => {
  const r = raw as ProviderPayload;
  if (!r || typeof r !== "object") throw new Error("Invalid payload: not an object");
  if (!isModel(r.model)) throw new Error("Invalid model");
  if (typeof r.cycle !== "string" || !CYCLE_RE.test(r.cycle)) throw new Error("Invalid cycle");
  if (typeof r.domain !== "string" || r.domain.length === 0) throw new Error("Invalid domain");
  if (typeof r.source !== "string" || r.source.length === 0) throw new Error("Invalid source");
  if (typeof r.generatedAt !== "string" || !ISO_DATETIME_RE.test(r.generatedAt)) throw new Error("Invalid generatedAt");
  if (!Array.isArray(r.parameters)) throw new Error("Invalid parameters");
  for (const p of r.parameters) {
    if (typeof p.id !== "string" || p.id.length === 0) throw new Error("Invalid param id");
    if (typeof p.displayName !== "string" || p.displayName.length === 0) throw new Error("Invalid displayName");
    if (typeof p.level !== "string" || p.level.length === 0) throw new Error("Invalid level");
    if (p.value !== null && typeof p.value !== "number") throw new Error("Invalid value");
    if (typeof p.validTime !== "string" || !ISO_DATETIME_RE.test(p.validTime)) throw new Error("Invalid validTime");
    if (typeof p.forecastHour !== "number" || p.forecastHour < 0 || p.forecastHour > 48) throw new Error("Invalid forecastHour");
    if (!isModel(p.model)) throw new Error("Invalid param model");
  }
  return r;
};
