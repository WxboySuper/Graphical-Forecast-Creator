import { useCallback, useEffect, useRef, useState } from 'react';
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
  requestLatestTstmData,
} from '../utils/tstmGeneration';

export type AutoTstmStatus = 'idle' | 'loading' | 'preview' | 'error';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

const EMPTY_FEATURES: Feature[] = [];

/** Returns a user-facing message when cached guidance is unavailable. */
const describeUnavailableGuidance = (): string =>
  'No cached Auto-TSTM guidance is available for this day yet. Try again after the next ingestion cycle.';

/** Orchestrates cached Auto-TSTM preview, apply, cancel, and stale-response protection. */
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
    if (!isDaySupported) {
      return;
    }
    setIsPanelOpen(true);
  }, [isDaySupported]);

  const fetchPreview = useCallback(async () => {
    if (!isDaySupported) {
      return;
    }

    const request = buildTstmRequest(forecastCycle, currentDay);
    clearInFlightRequest();
    const controller = new AbortController();
    abortRef.current = controller;
    activeRequestRef.current = request;
    setStatus('loading');
    setErrorMessage(null);
    setPreview(null);

    try {
      const response = await requestLatestTstmData(currentDay, 'full', controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      if (!isCurrentTstmRequest(request, activeRequestRef.current ?? request)) {
        return;
      }

      if (!response) {
        setPreview(null);
        setStatus('error');
        setErrorMessage(describeUnavailableGuidance());
        return;
      }

      setPreview({ request, response });
      setStatus('preview');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (!isCurrentTstmRequest(request, activeRequestRef.current ?? request)) {
        return;
      }
      setPreview(null);
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Auto-TSTM guidance is temporarily unavailable.'
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [clearInFlightRequest, currentDay, forecastCycle, isDaySupported]);

  fetchPreviewRef.current = fetchPreview;

  const applyPreview = useCallback(() => {
    if (!preview) {
      return;
    }

    const activeRequest = buildTstmRequest(forecastCycle, currentDay);
    if (!isCurrentTstmRequest(preview.request, activeRequest)) {
      clearPreview();
      setErrorMessage('This guidance is stale because the forecast day or cycle changed. Fetch again before applying.');
      setStatus('error');
      return;
    }

    dispatch(replaceTstmFeatures({ features: preview.response.features }));
    closePanel();
  }, [clearPreview, closePanel, currentDay, dispatch, forecastCycle, preview]);

  const cancelPreview = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }
    void fetchPreviewRef.current?.();
  }, [isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    const activeRequest = buildTstmRequest(forecastCycle, currentDay);
    if (activeRequestRef.current && !isCurrentTstmRequest(activeRequestRef.current, activeRequest)) {
      clearInFlightRequest();
      setPreview(null);
      setStatus('error');
      setErrorMessage('Forecast context changed. Fetch guidance again for the current day and cycle.');
    }
  }, [clearInFlightRequest, currentDay, forecastCycle, isPanelOpen]);

  useEffect(() => {
    if (!preview) {
      return;
    }

    const activeRequest = buildTstmRequest(forecastCycle, currentDay);
    if (!isCurrentTstmRequest(preview.request, activeRequest)) {
      clearPreview();
      if (isPanelOpen) {
        setErrorMessage('Forecast context changed. Fetch guidance again for the current day and cycle.');
        setStatus('error');
      }
    }
  }, [clearPreview, currentDay, forecastCycle, isPanelOpen, preview]);

  useEffect(() => () => clearInFlightRequest(), [clearInFlightRequest]);

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
