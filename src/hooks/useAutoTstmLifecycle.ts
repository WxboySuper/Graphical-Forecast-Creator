import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import type { ForecastCycle } from '../types/outlooks';
import type { DayType } from '../types/outlooks';
import type { TstmGenerationRequest } from '../types/tstmGeneration';
import { buildTstmRequest } from '../utils/buildTstmRequest';
import { isCurrentTstmRequest } from '../utils/tstmGeneration';
import type { AutoTstmStatus } from './useAutoTstm';

import type { TstmGenerationResponse } from '../types/tstmGeneration';

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

const CONTEXT_CHANGED_MESSAGE =
  'Forecast context changed. Fetch guidance again for the current day and cycle.';

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
    if (!isPanelOpen) {
      return;
    }

    const activeRequest = buildTstmRequest(forecastCycle, currentDay);
    if (activeRequestRef.current && !isCurrentTstmRequest(activeRequestRef.current, activeRequest)) {
      clearInFlightRequest();
      setPreview(null);
      setStatus('error');
      setErrorMessage(CONTEXT_CHANGED_MESSAGE);
    }
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
    if (!preview) {
      return;
    }

    const activeRequest = buildTstmRequest(forecastCycle, currentDay);
    if (!isCurrentTstmRequest(preview.request, activeRequest)) {
      clearPreview();
      if (isPanelOpen) {
        setErrorMessage(CONTEXT_CHANGED_MESSAGE);
        setStatus('error');
      }
    }
  }, [clearPreview, currentDay, forecastCycle, isPanelOpen, preview, setErrorMessage, setStatus]);

  useEffect(() => () => clearInFlightRequest(), [clearInFlightRequest]);
};
