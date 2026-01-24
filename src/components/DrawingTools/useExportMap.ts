import { useState, useCallback } from 'react';
import { exportMapAsImage, downloadDataUrl, getFormattedDate } from '../../utils/exportUtils';
import { OutlookData } from '../../types/outlooks';
import { ForecastMapHandle } from '../Map/ForecastMap';
import React from 'react';

interface UseExportMapParams {
  mapRef: React.RefObject<ForecastMapHandle | null>;
  outlooks: OutlookData;
  isExportDisabled: boolean;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const useExportMap = ({ mapRef, outlooks, isExportDisabled, addToast }: UseExportMapParams) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    // Don't proceed if export is disabled
    if (isExportDisabled) {
      addToast('The export feature is currently unavailable due to an issue. Please check back later or visit the GitHub repository for more information.', 'warning');
      return;
    }

    if (!mapRef.current) {
      addToast('Map reference not available. Cannot export.', 'error');
      return;
    }

    const map = mapRef.current.getMap();
    if (!map) {
      addToast('Map not fully loaded. Please try again.', 'error');
      return;
    }

    try {
      setIsExporting(true);

      // Show export options dialog
      // skipcq: JS-0052
      const title = prompt('Enter a title for your forecast image (optional):');

      // Generate the image with Redux store data
      const dataUrl = await exportMapAsImage(map, outlooks, title || undefined);

      // Download the image
      const filename = `forecast-outlook-${getFormattedDate()}.png`;
      downloadDataUrl(dataUrl, filename);
      addToast('Forecast exported successfully!', 'success');

    } catch (error) {
      console.error('Error exporting map:', error);
      addToast('Failed to export the map. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [addToast, isExportDisabled, mapRef, outlooks]);

  return { isExporting, handleExport };
};