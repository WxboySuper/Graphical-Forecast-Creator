import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import {
  CONTEXT_CHANGED_MESSAGE,
  isStaleActiveTstmRequest,
  isStaleTstmContext,
} from './autoTstmContextGuards';
import type { AutoTstmStatus } from './useAutoTstm';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

type AutoTstmLifecycleArgs = {
  isPanelOpen: boolean;
  preview: PreviewState | null;
  forecastCycle: ForecastCycle;
  currentDay: DayType;
  activeRequestRef: MutableRefObject<TstmGenerationRequest | null>;
  fetchPreviewRef: MutableRefObject<(() => Promise<void>) | null>;
  clearInFlightRequest: () => void;
  clearPreview: () => void;
  setPreview: (value: PreviewState | null) => void;
  setStatus: (value: AutoTstmStatus) => void;
  setErrorMessage: (value: string | null) => void;
};

/** Wires preview fetch, stale-response guards, and cleanup for Auto-TSTM. */
export const useAutoTstmLifecycle = ({
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
}: AutoTstmLifecycleArgs) => {
  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }
    fetchPreviewRef.current?.().catch(() => undefined);
  }, [fetchPreviewRef, isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen || !isStaleActiveTstmRequest(activeRequestRef.current, forecastCycle, currentDay)) {
      return;
    }
    clearInFlightRequest();
    setPreview(null);
    setStatus('error');
    setErrorMessage(CONTEXT_CHANGED_MESSAGE);
  }, [
    activeRequestRef,
    clearInFlightRequest,
    currentDay,
    forecastCycle,
    isPanelOpen,
    setErrorMessage,
    setPreview,
    setStatus,
  ]);

  useEffect(() => {
    if (!preview || !isStaleTstmContext(preview.request, forecastCycle, currentDay)) {
      return;
    }
    clearPreview();
    if (isPanelOpen) {
      setErrorMessage(CONTEXT_CHANGED_MESSAGE);
      setStatus('error');
    }
  }, [clearPreview, currentDay, forecastCycle, isPanelOpen, preview, setErrorMessage, setStatus]);

  useEffect(() => () => clearInFlightRequest(), [clearInFlightRequest]);
};
