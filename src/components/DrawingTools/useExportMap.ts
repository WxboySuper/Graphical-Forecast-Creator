import { useState, useCallback } from 'react';
import { exportMapAsImage, downloadDataUrl, getFormattedDate } from '../../utils/exportUtils';
import { OutlookData } from '../../types/outlooks';
import { ForecastMapHandle } from '../Map/ForecastMap';
import type React from 'react';

interface UseExportMapParams {
  mapRef: React.RefObject<ForecastMapHandle | null>;
  outlooks: OutlookData;
  isExportDisabled: boolean;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const useExportMap = ({ mapRef, outlooks, isExportDisabled, addToast }: UseExportMapParams) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const initiateExport = useCallback(() => {
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

    // Open modal to get title
    setIsModalOpen(true);
  }, [addToast, isExportDisabled, mapRef]);

  const confirmExport = useCallback(async (title: string) => {
    setIsModalOpen(false); // Close modal

    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;

    try {
      setIsExporting(true);

      // Generate the image with Redux store data
      const dataUrl = await exportMapAsImage(map, outlooks, {
        title: title || undefined,
        format: 'jpeg',
        quality: 0.92,
        includeLegendAndStatus: true
      });

      // Download the image
      const filename = `forecast-outlook-${getFormattedDate()}.jpg`;
      downloadDataUrl(dataUrl, filename);
      addToast('Forecast exported successfully!', 'success');

    } catch {
      addToast('Failed to export the map. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [addToast, mapRef, outlooks]);

  const cancelExport = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return { isExporting, isModalOpen, initiateExport, confirmExport, cancelExport };
};