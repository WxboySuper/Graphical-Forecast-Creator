import { useEffect, useMemo, useState } from 'react';
import type { MesoscaleCatalog, MesoscaleLatestPointer } from './catalogContracts';
import type { MesoscaleFrameType, MesoscaleModelId } from './contracts';
import { fetchMesoscaleCatalog, fetchMesoscaleLatest, fetchMesoscaleStatus, normalizeMesoscaleCatalog, resolveCycleId, type MesoscaleRequestResult, type RequestOptions } from './client';

const AGE_REFRESH_MS = 30_000;
const STALE_AFTER_MS = 180 * 60_000;
const hasData = <T,>(value: MesoscaleRequestResult<T>): value is Extract<MesoscaleRequestResult<T>, { data: T }> => 'data' in value;
export type MesoscaleHookOptions = Pick<RequestOptions, 'fetcher' | 'timeoutMs' | 'retries' | 'config'>;

export interface MesoscaleLatestState {
  result: MesoscaleRequestResult<MesoscaleLatestPointer>;
  ageMinutes: number | null;
  stale: boolean;
}

const useStableRequestOptions = (options: MesoscaleHookOptions) => useMemo(() => ({
  config: options.config,
  fetcher: options.fetcher,
  retries: options.retries,
  timeoutMs: options.timeoutMs,
}), [options.config, options.fetcher, options.retries, options.timeoutMs]);

const useNow = () => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

const useRequest = <T,>(load: (signal: AbortSignal) => Promise<MesoscaleRequestResult<T>>) => {
  const [result, setResult] = useState<MesoscaleRequestResult<T>>({ state: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: 'loading' });
    void load(controller.signal).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setResult({ state: 'upstream-failure', message: 'Mesoscale request failed.', retryable: true });
      }
    });
    return () => controller.abort();
  }, [load]);
  return [result, setResult] as const;
};

const useTimedRequest = <T,>(load: (signal: AbortSignal) => Promise<MesoscaleRequestResult<T>>) => {
  const [result] = useRequest(load);
  return { result, now: useNow() };
};

export const useMesoscaleLatest = (model: MesoscaleModelId, options: MesoscaleHookOptions = {}): MesoscaleLatestState => {
  const requestOptions = useStableRequestOptions(options);
  const load = useMemo(() => (signal: AbortSignal) => fetchMesoscaleLatest({ model, options: { ...requestOptions, signal } }), [model, requestOptions]);
  const { result, now } = useTimedRequest(load);
  const cycle = hasData(result) ? Date.parse(result.data.cycleTime) : Number.NaN;
  const ageMinutes = Number.isFinite(cycle) ? Math.max(0, Math.floor((now - cycle) / 60_000)) : null;
  const stale = hasData(result) && (result.stale || ageMinutes === null || ageMinutes > STALE_AFTER_MS / 60_000);
  const currentResult = stale ? { ...result, state: 'stale' as const, stale: true } : result;
  return { result: currentResult, ageMinutes, stale };
};

export const useMesoscaleStatus = (options: MesoscaleHookOptions = {}) => {
  const requestOptions = useStableRequestOptions(options);
  const load = useMemo(() => (signal: AbortSignal) => fetchMesoscaleStatus({ ...requestOptions, signal }), [requestOptions]);
  const { result, now } = useTimedRequest(load);
  if (!hasData(result)) return result;
  const models = result.data.models.map(model => {
    const parsed = model.latestCycleTime ? Date.parse(model.latestCycleTime) : Number.NaN;
    const age = Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 60_000)) : null;
    return { ...model, ageMinutes: age, stale: age === null || age > STALE_AFTER_MS / 60_000 };
  });
  const stale = models.some(model => model.stale);
  return { ...result, state: stale ? 'stale' as const : result.state, data: { ...result.data, models } };
};

export const selectMesoscaleFrames = (catalog: MesoscaleCatalog, type: MesoscaleFrameType) =>
  catalog.frames.filter(frame => frame.frameType === type).sort((left, right) => left.forecastHour - right.forecastHour);

export interface MesoscaleFramesState {
  result: MesoscaleRequestResult<MesoscaleCatalog>;
  analysis: ReturnType<typeof selectMesoscaleFrames>;
  forecast: ReturnType<typeof selectMesoscaleFrames>;
  normalizedParameters: ReturnType<typeof normalizeMesoscaleCatalog>;
  ageMinutes: number | null;
  stale: boolean;
}

const ageMinutesAt = (time: string, now: number): number | null => {
  const parsed = Date.parse(time);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 60_000)) : null;
};

const useFrameSelection = (catalog: MesoscaleCatalog | null, type: MesoscaleFrameType) =>
  useMemo(() => catalog ? selectMesoscaleFrames(catalog, type) : [], [catalog, type]);

const useFrameParameters = (catalog: MesoscaleCatalog | null, now: number) =>
  useMemo(() => catalog ? normalizeMesoscaleCatalog(catalog, now) : [], [catalog, now]);

const currentFrameResult = (result: MesoscaleRequestResult<MesoscaleCatalog>, stale: boolean) =>
  stale && hasData(result) ? { ...result, state: 'stale' as const, stale: true } : result;

const useFrameState = (result: MesoscaleRequestResult<MesoscaleCatalog>, now: number): MesoscaleFramesState => {
  const data = hasData(result) ? result.data : null;
  const ageMinutes = data ? ageMinutesAt(data.cycleTime, now) : null;
  const stale = (hasData(result) && result.stale) || (data !== null && (ageMinutes === null || ageMinutes > STALE_AFTER_MS / 60_000));
  const analysis = useFrameSelection(data, 'analysis');
  const forecast = useFrameSelection(data, 'forecast');
  const normalizedParameters = useFrameParameters(data, now);
  return { result: currentFrameResult(result, stale), analysis, forecast, normalizedParameters, ageMinutes, stale };
};

export const useMesoscaleFrames = (model: MesoscaleModelId, cycle: string, options: MesoscaleHookOptions = {}): MesoscaleFramesState => {
  const requestOptions = useStableRequestOptions(options);
  const load = useMemo(() => (signal: AbortSignal) => fetchMesoscaleCatalog({ model, cycle: resolveCycleId(cycle), options: { ...requestOptions, signal } }), [model, cycle, requestOptions]);
  const { result, now } = useTimedRequest(load);
  return useFrameState(result, now);
};
