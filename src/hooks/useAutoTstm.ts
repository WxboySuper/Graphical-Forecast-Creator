import { useCallback, useRef, useState } from 'react';
import type { Feature } from 'geojson';
import { useDispatch, useSelector } from 'react-redux';
import { selectCurrentDay, selectForecastCycle } from '../store/forecastSlice';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { canGenerateTstmForDay } from '../utils/tstmGeneration';
import { useAutoTstmActions } from './useAutoTstmActions';
import {
  useAutoTstmActiveRequestGuard,
  useAutoTstmCleanupEffect,
  useAutoTstmPanelFetchEffect,
  useAutoTstmPreviewGuard,
} from './useAutoTstmEffects';

export type AutoTstmStatus = 'idle' | 'loading' | 'preview' | 'error';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

const EMPTY_FEATURES: Feature[] = [];

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

  const { openPanel, fetchPreview, applyPreview, cancelPreview } = useAutoTstmActions({
    dispatch,
    forecastCycle,
    currentDay,
    isDaySupported,
    preview,
    abortRef,
    activeRequestRef,
    clearInFlightRequest,
    clearPreview,
    closePanel,
    setIsPanelOpen,
    setStatus,
    setErrorMessage,
    setPreview,
  });

  fetchPreviewRef.current = fetchPreview;

  useAutoTstmPanelFetchEffect(isPanelOpen, fetchPreviewRef);
  useAutoTstmActiveRequestGuard({
    isPanelOpen,
    forecastCycle,
    currentDay,
    activeRequestRef,
    clearInFlightRequest,
    setPreview,
    setStatus,
    setErrorMessage,
  });
  useAutoTstmPreviewGuard({
    isPanelOpen,
    preview,
    forecastCycle,
    currentDay,
    clearPreview,
    setStatus,
    setErrorMessage,
  });
  useAutoTstmCleanupEffect(clearInFlightRequest);

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
