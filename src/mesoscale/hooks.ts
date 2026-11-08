import { useEffect, useMemo, useState } from 'react';
import type { MesoscaleCatalog, MesoscaleLatestPointer, MesoscaleStatus } from './catalogContracts';
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

export const useMesoscaleLatest = (model: MesoscaleModelId, options: MesoscaleHookOptions = {}): MesoscaleLatestState => {
  const [result, setResult] = useState<MesoscaleRequestResult<MesoscaleLatestPointer>>({ state: 'loading' });
  const [now, setNow] = useState(Date.now());
  const requestOptions = useStableRequestOptions(options);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: 'loading' });
    void fetchMesoscaleLatest(model, { ...requestOptions, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult(value);
    });
    return () => controller.abort();
  }, [model, requestOptions]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  const cycle = hasData(result) ? Date.parse(result.data.cycleTime) : Number.NaN;
  const ageMinutes = Number.isFinite(cycle) ? Math.max(0, Math.floor((now - cycle) / 60_000)) : null;
  const stale = hasData(result) && (result.stale || now - cycle > STALE_AFTER_MS);
  const currentResult = stale ? { ...result, state: 'stale' as const, stale: true } : result;
  return { result: currentResult, ageMinutes, stale };
};

export const useMesoscaleStatus = (options: MesoscaleHookOptions = {}) => {
  const [result, setResult] = useState<MesoscaleRequestResult<MesoscaleStatus>>({ state: 'loading' });
  const [now, setNow] = useState(Date.now());
  const requestOptions = useStableRequestOptions(options);
  useEffect(() => {
    const controller = new AbortController();
    void fetchMesoscaleStatus({ ...requestOptions, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult(value);
    });
    return () => controller.abort();
  }, [requestOptions]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  if (!hasData(result)) return result;
  const models = result.data.models.map(model => {
    const age = model.latestCycleTime ? Math.max(0, Math.floor((now - Date.parse(model.latestCycleTime)) / 60_000)) : null;
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

export const useMesoscaleFrames = (model: MesoscaleModelId, cycle: string, options: MesoscaleHookOptions = {}): MesoscaleFramesState => {
  const [result, setResult] = useState<MesoscaleRequestResult<MesoscaleCatalog>>({ state: 'loading' });
  const [now, setNow] = useState(Date.now());
  const requestOptions = useStableRequestOptions(options);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: 'loading' });
    void fetchMesoscaleCatalog(model, resolveCycleId(cycle), { ...requestOptions, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult(value);
    });
    return () => controller.abort();
  }, [model, cycle, requestOptions]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  const data = hasData(result) ? result.data : null;
  const ageMinutes = data ? Math.max(0, Math.floor((now - Date.parse(data.cycleTime)) / 60_000)) : null;
  const staleFromResponse = hasData(result) ? result.stale : false;
  const staleFromAge = data ? now - Date.parse(data.cycleTime) > STALE_AFTER_MS : false;
  const stale = staleFromResponse || staleFromAge;
  const currentResult = stale && hasData(result) ? { ...result, state: 'stale' as const, stale: true } : result;
  const analysis = useMemo(() => data ? selectMesoscaleFrames(data, 'analysis') : [], [data]);
  const forecast = useMemo(() => data ? selectMesoscaleFrames(data, 'forecast') : [], [data]);
  const normalizedParameters = useMemo(() => data ? normalizeMesoscaleCatalog(data, now) : [], [data, now]);
  return { result: currentResult, analysis, forecast, normalizedParameters, ageMinutes, stale };
};
