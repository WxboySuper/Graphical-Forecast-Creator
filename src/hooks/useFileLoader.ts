import { downloadBlob, readForecastImportFile, validateForecastDataReason } from '../utils/fileUtils';
import { serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';
import { resolveNativeFileContent } from '../utils/forecastTransfer/nativeImportUtils';
import { DEFAULT_FORECAST_WORKSPACE, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import {
  markAsSaved,
  importForecastCycle,
  setMapView,
  setWorkflowMetadata,
  clearWorkflowMetadata,
} from '../store/forecastSlice';
import type { AddToastFn } from '../components/Layout';
import type { Dispatch } from 'redux';
import type { CycleMetadata, ForecastCycle } from '../types/outlooks';

/** Creates save and load file handler functions bound to the given toast notifier, Redux dispatch, and current forecast state. */
export function createFileHandlers({ addToast, dispatch, forecastCycle, cycleMetadata, mapView, workspaceId = DEFAULT_FORECAST_WORKSPACE }: {
  addToast: AddToastFn;
  dispatch: Dispatch;
  forecastCycle: ForecastCycle;
  cycleMetadata?: CycleMetadata;
  mapView?: { center: [number, number]; zoom: number };
  workspaceId?: ForecastWorkspaceId;
}) {
  const fileInputRef = { current: null as HTMLInputElement | null } as React.MutableRefObject<HTMLInputElement | null>;

  /** Maps a read/parse failure to an actionable toast message. */
  const notifyReadFailure = (file: File, error: unknown): void => {
    if (file.name.toLowerCase().endsWith('.zip')) {
      addToast('File is not a valid GFC package.', 'error');
    } else if (error instanceof SyntaxError) {
      addToast('File is not valid JSON.', 'error');
    } else if (error instanceof Error && error.message.includes('too large')) {
      addToast(error.message, 'error');
    } else {
      addToast('Error reading file.', 'error');
    }
  };

  /** Restores the workflow metadata from resolved envelope content, reading the inner forecast payload. */
  const syncWorkflowMetadata = (cycleMetadata: CycleMetadata | null | undefined): void => {
    if (cycleMetadata) {
      dispatch(setWorkflowMetadata(cycleMetadata));
    } else if (cycleMetadata === null) {
      dispatch(clearWorkflowMetadata());
    }
  };

  /** Reads a File object, validates the JSON content, deserializes it, and imports it as the active forecast cycle. */
  const handleLoad = async (file: File) => {
    try {
      let data: unknown;
      try {
        data = await readForecastImportFile(file);
      } catch (error) {
        notifyReadFailure(file, error);
        return;
      }

      const validationError = validateForecastDataReason(data);
      if (validationError) {
        addToast(validationError, 'error');
        return;
      }

      let resolved: ReturnType<typeof resolveNativeFileContent>;
      try {
        resolved = resolveNativeFileContent(data);
      } catch (error) {
        addToast(error instanceof Error ? error.message : 'Error reading file.', 'error');
        return;
      }
      if (resolved.workspaceId !== workspaceId) {
        addToast(`This forecast belongs to the ${resolved.workspaceId} workspace. Open it there before importing it.`, 'error');
        return;
      }

      dispatch(importForecastCycle(resolved.forecastCycle));
      syncWorkflowMetadata(resolved.cycleMetadata);
      if (resolved.mapView) dispatch(setMapView(resolved.mapView));
      for (const warning of resolved.warnings ?? []) {
        addToast(warning, 'warning');
      }
      addToast('Forecast loaded successfully!', 'success');
    } catch {
      addToast('Error reading file.', 'error');
    }
  };

  /** Handles file input change events: passes the selected file to handleLoad and resets the input value. */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoad(file).catch(() => undefined);
    }
    e.currentTarget.value = '';
  };

  /** Triggers the hidden file input element to open the OS file picker dialog. */
  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  /** Serializes the active workspace cycle to a workspace-owned JSON file, then marks the store as saved. */
  const handleSave = () => {
    try {
      const payload = serializeForecastWorkspace(
        workspaceId,
        forecastCycle,
        mapView ?? {
          center: [39.8283, -98.5795],
          zoom: 4,
        },
        cycleMetadata,
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        `gfc-forecast-${timestamp}.json`,
      );
      dispatch(markAsSaved());
      addToast('Forecast exported to JSON!', 'success');
    } catch {
      addToast('Error exporting forecast.', 'error');
    }
  };

  return {
    fileInputRef,
    handleLoad,
    handleFileSelect,
    handleOpenFilePicker,
    handleSave,
  };
}
