import { act, renderHook } from '@testing-library/react';
import * as fileUtils from '../utils/fileUtils';
import forecastReducer from '../store/forecastSlice';
import type { DiscussionData } from '../types/outlooks';
import {
  applyForecastImportResult,
  buildRestoreKey,
  buildRolloverSaveLabel,
  cycleHasDiscussionContent,
  downloadWorkspaceForecastJson,
  formatRolloverDayLabel,
  getDayRolloverPromptState,
  getMismatchedCloudWorkspaceId,
  getForecastImportWorkspaceError,
  hasRestorableCloudSelection,
  hasRolloverForecastData,
  hasUnpublishedDiscussionDrafts,
  hasUnsavedRolloverCandidateSession,
  INVALID_CLOUD_HANDOFF,
  parseStoredCloudMeta,
  parseStoredForecastPayload,
  runDayRolloverCloudSaveAction,
  runDayRolloverDownloadAction,
  useDayRolloverPrompt,
} from './forecastPageController';
import { serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';
import type { ForecastImportResult } from '../utils/forecastTransfer';

const createForecastCycle = () =>
  forecastReducer(undefined, { type: '@@forecastPageController/test' }).forecastCycle;

describe('forecastPageController', () => {
  test('rejects a transfer owned by another workspace before state mutation', () => {
    const result = { workspaceId: 'custom' } as ForecastImportResult;

    expect(getForecastImportWorkspaceError(result, 'severe')).toContain('custom workspace');
    expect(getForecastImportWorkspaceError({ ...result, workspaceId: 'severe' }, 'severe')).toBeNull();
  });

  test('keeps Severe-owned KML/KMZ in Severe and rejects it elsewhere', () => {
    const result = { workspaceId: 'severe', format: 'kml' } as ForecastImportResult;

    expect(getForecastImportWorkspaceError(result, 'severe')).toBeNull();
    expect(getForecastImportWorkspaceError(result, 'custom')).toContain('severe workspace');
  });

  test('rejects unowned transfers in every workspace, including severe', () => {
    const result = { workspaceId: null, format: 'kml' } as ForecastImportResult;

    expect(getForecastImportWorkspaceError(result, 'severe')).toContain('does not declare');
    expect(getForecastImportWorkspaceError(result, 'custom')).toContain('does not declare');
  });

  test('refuses to mutate state when the apply path sees a workspace mismatch', () => {
    const dispatch = jest.fn();
    const mapRef = { current: null } as never;
    const result = { workspaceId: 'custom', forecastCycle: createForecastCycle(), warnings: [], format: 'json' } as ForecastImportResult;

    expect(applyForecastImportResult(result, dispatch, mapRef, 'severe')).toContain('custom workspace');
    expect(dispatch).not.toHaveBeenCalled();
    expect(applyForecastImportResult({ ...result, workspaceId: 'severe' }, dispatch, mapRef, 'severe')).toBeNull();
    expect(dispatch).toHaveBeenCalled();
  });

  test('owns rollover labels, restore metadata parsing, and scope helpers', () => {
    expect(buildRolloverSaveLabel('2026-04-24')).toContain('Apr 24');
    expect(formatRolloverDayLabel('2026-04-24')).toContain('April 24');
    expect(formatRolloverDayLabel('bad-date')).toBe('bad-date');
    expect(parseStoredForecastPayload(null)).toBeNull();
    expect(parseStoredForecastPayload('not-json')).toBeNull();
    expect(parseStoredCloudMeta('{"id":"abc","label":"Cycle"}')).toEqual({
      id: 'abc',
      label: 'Cycle',
    });
    expect(hasRestorableCloudSelection({ id: 'abc', label: 'Cycle' })).toBe(true);
    expect(hasRestorableCloudSelection({ id: 'abc' })).toBe(false);
    expect(buildRestoreKey(null)).toBe('anonymous');
    expect(buildRestoreKey('user-1')).toBe('user-1');
    // Restore keys are workspace-scoped so switching products re-runs restore.
    expect(buildRestoreKey('user-1', 'custom')).toBe('user-1:custom');
    expect(buildRestoreKey(null, 'custom')).toBe('anonymous:custom');
  });

  test('accepts matching envelopes and rejects cross-workspace envelopes', () => {
    const forecast = fileUtils.serializeForecast(createForecastCycle(), {
      center: [0, 0],
      zoom: 4,
    });
    const customPayload = JSON.stringify({
      schemaVersion: 1,
      workspaceId: 'custom',
      forecast,
    });

    expect(parseStoredForecastPayload(customPayload, 'custom')).toEqual(JSON.parse(customPayload));
    expect(parseStoredForecastPayload(customPayload, 'severe')).toBeNull();
    expect(parseStoredForecastPayload(JSON.stringify(forecast), 'custom')).toBeNull();
    expect(parseStoredForecastPayload(JSON.stringify(forecast), 'severe')).toEqual(forecast);
  });

  test('identifies a cloud handoff staged for a different workspace', () => {
    const cycle = createForecastCycle();
    const customStored = JSON.stringify(serializeForecastWorkspace('custom', cycle, { center: [0, 0], zoom: 4 }));
    const severeStored = JSON.stringify(serializeForecastWorkspace('severe', cycle, { center: [0, 0], zoom: 4 }));

    expect(getMismatchedCloudWorkspaceId(customStored, 'custom')).toBeNull();
    expect(getMismatchedCloudWorkspaceId(customStored, 'severe')).toBe('custom');
    expect(getMismatchedCloudWorkspaceId(severeStored, 'custom')).toBe('severe');
    // Absence is not corruption.
    expect(getMismatchedCloudWorkspaceId(null, 'severe')).toBeNull();
    expect(getMismatchedCloudWorkspaceId('', 'severe')).toBeNull();
  });

  test('tags malformed or unknown cloud handoffs as invalid instead of absent', () => {
    // Malformed JSON, unsupported shapes, unknown workspace ids, and known-but-invalid
    // envelopes must all surface as a tagged invalid handoff so callers clear them.
    expect(getMismatchedCloudWorkspaceId('not-json', 'severe')).toBe(INVALID_CLOUD_HANDOFF);
    expect(getMismatchedCloudWorkspaceId(JSON.stringify({ nope: true }), 'severe')).toBe(INVALID_CLOUD_HANDOFF);
    expect(getMismatchedCloudWorkspaceId(
      JSON.stringify({ schemaVersion: 1, workspaceId: 'bogus', forecast: {} }),
      'severe',
    )).toBe(INVALID_CLOUD_HANDOFF);
    expect(getMismatchedCloudWorkspaceId(
      JSON.stringify({ schemaVersion: 1, workspaceId: 'severe', forecast: { nope: true } }),
      'severe',
    )).toBe(INVALID_CLOUD_HANDOFF);
  });

  test('derives rollover candidates and preserves pending prompts', () => {
    const emptyCycle = createForecastCycle();
    const cycleWithDiscussion = {
      ...emptyCycle,
      days: {
        ...emptyCycle.days,
        1: {
          ...emptyCycle.days[1],
          discussion: { mode: 'diy', diyContent: 'A discussion' },
        },
      },
    } as Parameters<typeof cycleHasDiscussionContent>[0];

    expect(hasRolloverForecastData(emptyCycle)).toBe(false);
    expect(cycleHasDiscussionContent(cycleWithDiscussion)).toBe(true);
    expect(hasUnsavedRolloverCandidateSession(cycleWithDiscussion, false)).toBe(true);
    expect(hasUnpublishedDiscussionDrafts({})).toBe(false);
    expect(hasUnpublishedDiscussionDrafts({
      anonymous: { mode: 'diy', diyContent: 'draft' } as DiscussionData,
    })).toBe(true);

    const pendingPrompt = { previousDay: '2026-04-23', currentDay: '2026-04-24' };
    expect(getDayRolloverPromptState({
      restoreComplete: true,
      lastActiveDay: '2026-04-24',
      today: '2026-04-24',
      alreadyPromptedToday: true,
      pendingPrompt,
      promptOpen: false,
      forecastCycle: emptyCycle,
      isSaved: true,
    })).toEqual(pendingPrompt);
  });

  test('resets only after rollover download or cloud save succeeds', async () => {
    const forecastCycle = createForecastCycle();
    const mapView = { center: [0, 0] as [number, number], zoom: 4 };
    const dispatch = jest.fn();
    const clearCurrent = jest.fn();
    const exportSpy = jest.spyOn(fileUtils, 'downloadBlob').mockImplementation(() => undefined);

    expect(runDayRolloverDownloadAction({ forecastCycle, mapView, dispatch, workspaceId: 'severe' })).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const downloadedBlob = exportSpy.mock.calls[0]?.[0] as Blob;
    expect(downloadedBlob).toBeInstanceOf(Blob);

    exportSpy.mockImplementationOnce(() => { throw new Error('download failed'); });
    dispatch.mockClear();
    expect(runDayRolloverDownloadAction({ forecastCycle, mapView, dispatch, workspaceId: 'severe' })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    const saveCycle = jest.fn().mockResolvedValue(true);
    dispatch.mockClear();
    expect(await runDayRolloverCloudSaveAction({
      forecastCycle,
      currentMapView: mapView,
      saveCycle,
      clearCurrent,
      dispatch,
      workspaceId: 'severe',
    })).toBe(true);
    expect(clearCurrent).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    // Rollover cloud saves carry the active workspace explicitly.
    expect(saveCycle).toHaveBeenLastCalledWith(
      expect.any(String),
      forecastCycle.cycleDate,
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ saveAsNew: true, workspaceId: 'severe' }),
    );

    saveCycle.mockResolvedValueOnce(false);
    clearCurrent.mockClear();
    dispatch.mockClear();
    expect(await runDayRolloverCloudSaveAction({
      forecastCycle,
      currentMapView: mapView,
      saveCycle,
      clearCurrent,
      dispatch,
      workspaceId: 'custom',
    })).toBe(false);
    expect(saveCycle).toHaveBeenLastCalledWith(
      expect.any(String),
      forecastCycle.cycleDate,
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ saveAsNew: true, workspaceId: 'custom' }),
    );
    expect(clearCurrent).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    exportSpy.mockRestore();
  });

  test('persists workspace identity on native JSON downloads', async () => {
    const forecastCycle = createForecastCycle();
    const mapView = { center: [39.8, -98.5] as [number, number], zoom: 4 };
    const seen: string[] = [];
    const OriginalBlob = global.Blob;
    class CapturingBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (parts) seen.push(parts.map((part) => (typeof part === 'string' ? part : '')).join(''));
      }
    }
    global.Blob = CapturingBlob as typeof Blob;
    const downloadSpy = jest.spyOn(fileUtils, 'downloadBlob').mockImplementation(() => undefined);

    try {
      downloadWorkspaceForecastJson('custom', forecastCycle, mapView);
      const payload = JSON.parse(seen.join('')) as { workspaceId?: string };
      expect(payload.workspaceId).toBe('custom');
    } finally {
      global.Blob = OriginalBlob;
      downloadSpy.mockRestore();
    }
  });

  test('keeps Custom ownership on rollover download through useDayRolloverPrompt', () => {
    const forecastCycle = createForecastCycle();
    const currentMapView = { center: [39.8, -98.5] as [number, number], zoom: 4 };
    const seen: string[] = [];
    const OriginalBlob = global.Blob;
    class CapturingBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (parts) seen.push(parts.map((part) => (typeof part === 'string' ? part : '')).join(''));
      }
    }
    global.Blob = CapturingBlob as typeof Blob;
    const downloadSpy = jest.spyOn(fileUtils, 'downloadBlob').mockImplementation(() => undefined);
    const dispatch = jest.fn();
    const addToast = jest.fn();
    const clearCurrent = jest.fn();
    const saveCycle = jest.fn();

    try {
      const { result, unmount } = renderHook(() => useDayRolloverPrompt({
        restoreComplete: false,
        restoredSession: false,
        dispatch,
        addToast,
        forecastCycle,
        currentMapView,
        isSaved: false,
        canSaveToCloud: false,
        saveCycle,
        clearCurrent,
        workspaceId: 'custom',
      }));

      act(() => {
        result.current.handleDownloadAndStartNewDay();
      });

      expect(downloadSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(seen.join('')) as { workspaceId?: string };
      expect(payload.workspaceId).toBe('custom');
      expect(dispatch).toHaveBeenCalledTimes(1);
      unmount();
    } finally {
      global.Blob = OriginalBlob;
      downloadSpy.mockRestore();
    }
  });

  test('keeps Severe ownership on rollover download through useDayRolloverPrompt', () => {
    const forecastCycle = createForecastCycle();
    const currentMapView = { center: [0, 0] as [number, number], zoom: 4 };
    const exportSpy = jest.spyOn(fileUtils, 'downloadBlob').mockImplementation(() => undefined);
    const dispatch = jest.fn();

    try {
      const { result, unmount } = renderHook(() => useDayRolloverPrompt({
        restoreComplete: false,
        restoredSession: false,
        dispatch,
        addToast: jest.fn(),
        forecastCycle,
        currentMapView,
        isSaved: false,
        canSaveToCloud: false,
        saveCycle: jest.fn(),
        clearCurrent: jest.fn(),
        workspaceId: 'severe',
      }));

      act(() => {
        result.current.handleDownloadAndStartNewDay();
      });

      expect(exportSpy).toHaveBeenCalledTimes(1);
      const downloadedBlob = exportSpy.mock.calls[0]?.[0] as Blob;
      expect(downloadedBlob).toBeInstanceOf(Blob);
      expect(dispatch).toHaveBeenCalledTimes(1);
      unmount();

      exportSpy.mockClear();
      dispatch.mockClear();
      expect(runDayRolloverDownloadAction({ forecastCycle, mapView: currentMapView, dispatch })).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally {
      exportSpy.mockRestore();
    }
  });
});
