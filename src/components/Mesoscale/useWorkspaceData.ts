/**
 * Resolves the selected model's latest cycle and catalog into one description of the model data:
 * either ready (a catalog and a frame to show) or unavailable (loading, failed, or unreadable).
 * The workspace shows the map, areas, and discussion in both cases; only the model layers depend on it.
 */
import { useMemo } from 'react';
import {
  useMesoscaleFrames,
  useMesoscaleLatest,
  type MesoscaleCatalog,
  type MesoscaleCatalogParameter,
  type MesoscaleRequestResult,
} from '../../mesoscale';
import type { MesoscaleSelection } from './useMesoscaleSelection';

export type Frame = MesoscaleCatalog['frames'][number];

export interface ReadyWorkspaceData {
  kind: 'ready';
  catalog: MesoscaleCatalog;
  frame: Frame;
  parameters: MesoscaleCatalogParameter[];
  ageMinutes: number | null;
  stale: boolean;
}

export interface UnavailableWorkspaceData {
  kind: 'unavailable';
  result: MesoscaleRequestResult<unknown>;
  subject: string;
}

export type WorkspaceData = ReadyWorkspaceData | UnavailableWorkspaceData;

const usableParameters = (frame: Frame): MesoscaleCatalogParameter[] =>
  frame.parameters.filter(parameter => parameter.status !== 'failed');

const pickFrame = (catalog: MesoscaleCatalog, forecastHour: number): Frame | undefined =>
  catalog.frames.find(item => item.forecastHour === forecastHour) ?? catalog.frames[0];

export const useWorkspaceData = (selection: MesoscaleSelection): WorkspaceData => {
  const latest = useMesoscaleLatest(selection.modelId);
  const cycleTime = 'data' in latest.result ? latest.result.data.cycleTime : null;
  const frames = useMesoscaleFrames(selection.modelId, cycleTime);
  const catalog = 'data' in frames.result ? frames.result.data : null;
  const frame = catalog ? pickFrame(catalog, selection.forecastHour) : undefined;
  const parameters = useMemo(() => (frame ? usableParameters(frame) : []), [frame]);
  const { ageMinutes, stale } = frames;
  const latestSubject = `the latest ${selection.modelId.toUpperCase()} run`;

  return useMemo<WorkspaceData>(() => {
    if (catalog && frame) return { kind: 'ready', catalog, frame, parameters, ageMinutes, stale };
    if (cycleTime === null) return { kind: 'unavailable', result: latest.result, subject: latestSubject };
    return { kind: 'unavailable', result: frames.result, subject: 'the model catalog' };
  }, [catalog, frame, parameters, ageMinutes, stale, cycleTime, latest.result, latestSubject, frames.result]);
};
