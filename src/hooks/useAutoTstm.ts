import { useCallback, useRef, useState } from 'react';
import type { Feature } from 'geojson';
import { useDispatch, useSelector } from 'react-redux';
import {
  replaceTstmFeatures,
  selectCurrentDay,
  selectForecastCycle,
} from '../store/forecastSlice';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { buildTstmRequest } from '../utils/buildTstmRequest';
import {
  canGenerateTstmForDay,
  isCurrentTstmRequest,
} from '../utils/tstmGeneration';
import { runAutoTstmPreviewFetch } from './autoTstmPreviewFetch';
import { useAutoTstmLifecycle } from './useAutoTstmLifecycle';

export type AutoTstmStatus = 'idle' | 'loading' | 'preview' | 'error';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

const EMPTY_FEATURES: Feature[] = [];

const STALE_APPLY_MESSAGE =
  'This guidance is stale because the forecast day or cycle changed. Fetch again before applying.';

/** Orchestrates cached Auto-TSTM preview, apply, cancel, and stale-result protection. */
export const useAutoTstm = () => {
  const dispatch = useDispatch();
  const forecastCycle = useSelector(selectForecastCycle);
  const currentDay = useSelector(selectCurrentDay);
  const [status, setStatus] = useState<AutoTstmStatus>('idle');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<TstmGenerationRequest | null>(null);
  const fetchPreviewRef = useRef<(() => Promise<void>) | null>(null);
  const isDaySupported = canGenerateTstmForDay(currentDay);

  const clearInFlightRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeRequestRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    clearInFlightRequest();
    setPreview(null);
    setErrorMessage(null);
    setStatus('idle');
  }, [clearInFlightRequest]);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    clearPreview();
  }, [clearPreview]);

  const openPanel = useCallback(() => {
    if (isDaySupported) {
      setIsPanelOpen(true);
    }
  }, [isDaySupported]);

  const fetchPreview = useCallback(async () => {
    await runAutoTstmPreviewFetch({
      isDaySupported,
      forecastCycle,
      currentDay,
      clearInFlightRequest,
      abortRef,
      activeRequestRef,
      setStatus,
      setErrorMessage,
      setPreview,
    });
  }, [clearInFlightRequest, currentDay, forecastCycle, isDaySupported]);

  fetchPreviewRef.current = fetchPreview;

  const applyPreview = useCallback(() => {
    if (!preview) {
      return;
    }

    const activeRequest = buildTstmRequest(forecastCycle, currentDay);
    if (!isCurrentTstmRequest(preview.request, activeRequest)) {
      clearPreview();
      setErrorMessage(STALE_APPLY_MESSAGE);
      setStatus('error');
      return;
    }

    dispatch(replaceTstmFeatures({ features: preview.response.features }));
    closePanel();
  }, [clearPreview, closePanel, currentDay, dispatch, forecastCycle, preview]);

  const cancelPreview = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  useAutoTstmLifecycle({
    isPanelOpen,
    preview,
    forecastCycle,
    currentDay,
    activeRequestRef,
    fetchPreviewRef,
    clearInFlightRequest,
    clearPreview,
    setPreview,
    setStatus,
    setErrorMessage,
  });

  return {
    status,
    isPanelOpen,
    isDaySupported,
    previewFeatures: preview?.response.features ?? EMPTY_FEATURES,
    previewResponse: preview?.response ?? null,
    errorMessage,
    openPanel,
    closePanel,
    fetchPreview,
    applyPreview,
    cancelPreview,
  };
};

export type UseAutoTstmResult = ReturnType<typeof useAutoTstm>;
