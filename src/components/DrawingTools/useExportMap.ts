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

/**
 * Hook to manage map export actions (open modal, generate image, download).
 *
 * @param param0 - mapRef, outlooks, isExportDisabled, addToast
 * @returns { isExporting, isModalOpen, initiateExport, confirmExport, cancelExport }
 */
export const useExportMap = ({ mapRef, outlooks, isExportDisabled, addToast }: UseExportMapParams) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  /**
   * Returns true when the current map engine is Leaflet.
   */
  const isLeafletMap = useCallback((): boolean => {
    try {
      return !!(mapRef.current && typeof mapRef.current.getEngine === 'function' && mapRef.current.getEngine() === 'leaflet');
    } catch {
      return false;
    }
  }, [mapRef]);

  /**
   * Validate common preconditions for running an export. Shows user-facing toasts
   * when a precondition fails.
   */
  const checkExportPreconditions = useCallback((): boolean => {
    if (isExportDisabled) {
      addToast('The export feature is currently unavailable due to an issue. Please check back later or visit the GitHub repository for more information.', 'warning');
      return false;
    }

    if (!mapRef.current) {
      addToast('Map reference not available. Cannot export.', 'error');
      return false;
    }

    if (!isLeafletMap()) {
      addToast('Map export is only available for Leaflet maps right now. The current OpenLayers map cannot be exported.', 'warning');
      return false;
    }

    const map = mapRef.current.getMap();
    if (!map) {
      addToast('Map not fully loaded. Please try again.', 'error');
      return false;
    }

    return true;
  }, [isExportDisabled, mapRef, isLeafletMap, addToast]);

  const initiateExport = useCallback(() => {
    if (!checkExportPreconditions()) return;
    // Open modal to get title
    setIsModalOpen(true);
  }, [checkExportPreconditions]);

  const confirmExport = useCallback(async (title: string) => {
    setIsModalOpen(false); // Close modal

    if (!checkExportPreconditions()) return;

    const map = mapRef.current!.getMap();

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
  }, [checkExportPreconditions, outlooks, addToast, mapRef]);

  const cancelExport = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return { isExporting, isModalOpen, initiateExport, confirmExport, cancelExport };
};
