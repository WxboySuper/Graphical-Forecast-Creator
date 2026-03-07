import { exportForecastToJson, deserializeForecast, validateForecastData } from '../utils/fileUtils';
import { markAsSaved, importForecastCycle } from '../store/forecastSlice';
import type { AddToastFn } from '../components/Layout';
import type { Dispatch } from 'redux';

export function createFileHandlers({ addToast, dispatch, forecastCycle }: {
  addToast: AddToastFn;
  dispatch: Dispatch;
  forecastCycle: any;
}) {
  const fileInputRef = { current: null as HTMLInputElement | null } as React.MutableRefObject<HTMLInputElement | null>;

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

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

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
