import { deserializeForecast, downloadBlob, readForecastImportFile, validateForecastDataReason } from '../utils/fileUtils';
import { isWorkflowExportPackage } from '../utils/workflowPackage';
import { deserializeForecastWorkspace, serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';
import { DEFAULT_FORECAST_WORKSPACE, getForecastWorkspace, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import {
  markAsSaved,
  importForecastCycle,
  setWorkflowMetadata,
  clearWorkflowMetadata,
} from '../store/forecastSlice';
import type { AddToastFn } from '../components/Layout';
import type { Dispatch } from 'redux';
import type { CycleMetadata, ForecastCycle } from '../types/outlooks';

/** Reads the outer workspace named by a package. Missing means legacy; present-but-unknown is rejected. */
const resolvePackageOuterWorkspace = (data: { workspaceId?: unknown }): ForecastWorkspaceId | null => {
  if (data.workspaceId === undefined) return null;
  if (typeof data.workspaceId !== 'string' || getForecastWorkspace(data.workspaceId) === undefined) {
    throw new Error('This workflow package declares an unknown workspace.');
  }
  return data.workspaceId as ForecastWorkspaceId;
};

/** Returns true when an explicit outer owner disagrees with a non-legacy inner forecast. */
const isPackageWorkspaceMismatch = (
  outer: ForecastWorkspaceId | null,
  restored: ReturnType<typeof deserializeForecastWorkspace>,
): boolean => {
  if (outer === null) return false;
  if (restored.legacy) return false;
  return outer !== restored.workspaceId;
};

/** Throws when an explicit outer owner disagrees with a non-legacy inner forecast. */
const assertPackageWorkspaceMatch = (
  outer: ForecastWorkspaceId | null,
  restored: ReturnType<typeof deserializeForecastWorkspace>,
): void => {
  if (isPackageWorkspaceMismatch(outer, restored)) {
    throw new Error('This workflow package declares a workspace that does not match its forecast.');
  }
};

/** Returns the workspace that owns a workflow package, with the outer envelope as canonical. */
const resolvePackageWorkspace = (data: { workspaceId?: unknown; forecast: unknown }): ForecastWorkspaceId => {
  const outer = resolvePackageOuterWorkspace(data);
  const restored = deserializeForecastWorkspace(data.forecast);
  assertPackageWorkspaceMatch(outer, restored);
  return outer ?? restored.workspaceId;
};

/** Returns the workspace that owns a loaded file, with the package outer envelope as canonical. */
const resolveLoadedFileWorkspace = (data: unknown): ForecastWorkspaceId => {
  if (isWorkflowExportPackage(data)) return resolvePackageWorkspace(data);
  return deserializeForecastWorkspace(data).workspaceId;
};

/** Creates save and load file handler functions bound to the given toast notifier, Redux dispatch, and current forecast state. */
export function createFileHandlers({ addToast, dispatch, forecastCycle, cycleMetadata, workspaceId = DEFAULT_FORECAST_WORKSPACE }: {
  addToast: AddToastFn;
  dispatch: Dispatch;
  forecastCycle: ForecastCycle;
  cycleMetadata?: CycleMetadata;
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

  /** Restores the workflow metadata embedded in a loaded forecast, if any. */
  const syncWorkflowMetadata = (data: unknown): void => {
    const validatedData = data as {
      metadata?: CycleMetadata;
      cycleMetadata?: CycleMetadata | null;
    };
    const packageMetadata = isWorkflowExportPackage(data) ? validatedData.metadata : validatedData.cycleMetadata;
    if (packageMetadata) {
      dispatch(setWorkflowMetadata(packageMetadata));
    } else if (validatedData.cycleMetadata === null) {
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

      let loadedWorkspaceId: ForecastWorkspaceId;
      try {
        loadedWorkspaceId = resolveLoadedFileWorkspace(data);
      } catch (error) {
        addToast(error instanceof Error ? error.message : 'Error reading file.', 'error');
        return;
      }
      if (loadedWorkspaceId !== workspaceId) {
        addToast(`This forecast belongs to the ${loadedWorkspaceId} workspace. Open it there before importing it.`, 'error');
        return;
      }

      const deserializedCycle = deserializeForecast(data);
      dispatch(importForecastCycle(deserializedCycle));
      syncWorkflowMetadata(data);
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
        {
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
