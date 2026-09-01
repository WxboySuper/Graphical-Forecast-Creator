import type { MesoscaleParameter } from "../mesoscale/contract";

export interface MonitorMesoscaleLayer {
  id: string;
  paramId: string; // e.g., CAPE, STP
  enabled: boolean;
  opacity: number; // 0-1
  legend: { min: number; max: number; colors: string[] } | null;
}

export const getMesoscaleLayerConfig = (param: MesoscaleParameter): MonitorMesoscaleLayer => ({
  id: `mesoscale-${param.id}-${param.forecastHour}`,
  paramId: param.id,
  enabled: param.value !== null,
  opacity: 0.6,
  legend: param.legend ?? null,
});

export const isMesoscaleLayerEnabled = (layer: MonitorMesoscaleLayer): boolean => layer.enabled;

export const isMonitorMesoscaleAvailable = (params: MesoscaleParameter[]): boolean =>
  params.some((p) => p.value !== null);
