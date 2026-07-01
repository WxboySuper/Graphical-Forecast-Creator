import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Dispatch } from '@reduxjs/toolkit';
import { replaceTstmFeatures } from '../store/forecastSlice';
import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { buildTstmRequest } from '../utils/buildTstmRequest';
import { isCurrentTstmRequest } from '../utils/tstmGeneration';
import { runAutoTstmPreviewFetch } from './autoTstmPreviewFetch';
import type { AutoTstmStatus } from './useAutoTstm';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

const STALE_APPLY_MESSAGE =
  'This guidance is stale because the forecast day or cycle changed. Fetch again before applying.';

type UseAutoTstmActionsArgs = {
  dispatch: Dispatch;
  forecastCycle: ForecastCycle;
  currentDay: DayType;
  isDaySupported: boolean;
  preview: PreviewState | null;
  abortRef: MutableRefObject<AbortController | null>;
  activeRequestRef: MutableRefObject<TstmGenerationRequest | null>;
  clearInFlightRequest: () => void;
  clearPreview: () => void;
  closePanel: () => void;
  setIsPanelOpen: (value: boolean) => void;
  setStatus: (value: AutoTstmStatus) => void;
  setErrorMessage: (value: string | null) => void;
  setPreview: (value: PreviewState | null) => void;
};

/** Builds Auto-TSTM panel and preview action handlers for the orchestration hook. */
export const useAutoTstmActions = ({
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
}: UseAutoTstmActionsArgs) => {
  const openPanel = useCallback(() => {
    if (isDaySupported) {
      setIsPanelOpen(true);
    }
  }, [isDaySupported, setIsPanelOpen]);

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
  }, [
    abortRef,
    activeRequestRef,
    clearInFlightRequest,
    currentDay,
    forecastCycle,
    isDaySupported,
    setErrorMessage,
    setPreview,
    setStatus,
  ]);

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
  }, [clearPreview, closePanel, currentDay, dispatch, forecastCycle, preview, setErrorMessage, setStatus]);

  const cancelPreview = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  return {
    openPanel,
    fetchPreview,
    applyPreview,
    cancelPreview,
  };
};
