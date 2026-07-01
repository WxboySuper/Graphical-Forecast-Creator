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
  requestLatestTstmData,
} from '../utils/tstmGeneration';
import { resolveTstmFetchOutcome } from './autoTstmFetch';
import { useAutoTstmLifecycle } from './useAutoTstmLifecycle';

export type AutoTstmStatus = 'idle' | 'loading' | 'preview' | 'error';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

const EMPTY_FEATURES: Feature[] = [];

const UNAVAILABLE_MESSAGE =
  'No cached Auto-TSTM guidance is available for this day yet. Try again after the next ingestion cycle.';

const STALE_APPLY_MESSAGE =
  'This guidance is stale because the forecast day or cycle changed. Fetch again before applying.';

/** Applies a fetch resolution to preview UI state when it is actionable. */
const applyFetchOutcome = (
  outcome: ReturnType<typeof resolveTstmFetchOutcome>,
  setPreview: (value: PreviewState | null) => void,
  setStatus: (value: AutoTstmStatus) => void,
  setErrorMessage: (value: string | null) => void
): void => {
  if (outcome.kind === 'aborted' || outcome.kind === 'stale') {
    return;
  }
  if (outcome.kind === 'unavailable') {
    setPreview(null);
    setStatus('error');
    setErrorMessage(UNAVAILABLE_MESSAGE);
    return;
  }
  if (outcome.kind === 'error') {
    setPreview(null);
    setStatus('error');
    setErrorMessage(outcome.message);
    return;
  }
  setPreview({ request: outcome.request, response: outcome.response });
  setStatus('preview');
};

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
      applyFetchOutcome(
        resolveTstmFetchOutcome({
          request,
          activeRequest: activeRequestRef.current,
          response,
          aborted: controller.signal.aborted,
          error: null,
        }),
        setPreview,
        setStatus,
        setErrorMessage
      );
    } catch (error) {
      applyFetchOutcome(
        resolveTstmFetchOutcome({
          request,
          activeRequest: activeRequestRef.current,
          response: null,
          aborted: controller.signal.aborted,
          error,
        }),
        setPreview,
        setStatus,
        setErrorMessage
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
