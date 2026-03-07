import { exportForecastToJson, deserializeForecast, validateForecastData } from '../utils/fileUtils';
import { markAsSaved, importForecastCycle } from '../store/forecastSlice';
import type { AddToastFn } from '../components/Layout';
import type { Dispatch } from 'redux';
import type { ForecastCycle } from '../types/outlooks';

/** Creates save and load file handler functions bound to the given toast notifier, Redux dispatch, and current forecast state. */
export function createFileHandlers({ addToast, dispatch, forecastCycle }: {
  addToast: AddToastFn;
  dispatch: Dispatch;
  forecastCycle: ForecastCycle;
}) {
  const fileInputRef = { current: null as HTMLInputElement | null } as React.MutableRefObject<HTMLInputElement | null>;

  /** Reads a File object, validates the JSON content, deserializes it, and imports it as the active forecast cycle. */
  const handleLoad = async (file: File) => {
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        addToast('File is not valid JSON.', 'error');
        return;
      }

      if (!validateForecastData(data)) {
        addToast('Invalid forecast data format.', 'error');
        return;
      }

      const deserializedCycle = deserializeForecast(data);
      dispatch(importForecastCycle(deserializedCycle));
      addToast('Forecast loaded successfully!', 'success');
    } catch {
      addToast('Error reading file.', 'error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleLoad(file);
    }
    e.currentTarget.value = '';
  };

  /** Triggers the hidden file input element to open the OS file picker dialog. */
  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  /** Serializes the current forecast cycle to a JSON file and downloads it, then marks the store as saved. */
  const handleSave = () => {
    try {
      exportForecastToJson(forecastCycle, {
        center: [39.8283, -98.5795],
        zoom: 4,
      });
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
