import L from 'leaflet';
import html2canvas from 'html2canvas';

interface ExportOptions {
  title?: string;
  date?: string;
  attribution?: boolean;
}

/**
 * Core function to export the map view
 */
export const exportMapAsImage = async (map: L.Map, options: ExportOptions = {}): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Get the map container
      const container = map.getContainer();

      // Wait for any map animations/movements to finish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture current map state
      const canvas = await html2canvas(container, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        scale: window.devicePixelRatio * 2,
        logging: false,
        imageTimeout: 0,
        onclone: (clonedDoc) => {
          // This is where we'll handle any pre-capture DOM modifications if needed
          const clonedContainer = clonedDoc.querySelector('#' + container.id) as HTMLElement;
          if (clonedContainer) {
            // Ensure container is visible and positioned correctly
            clonedContainer.style.visibility = 'visible';
            clonedContainer.style.position = 'relative';
          }
        }
      });

      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    } catch (err) {
      console.error('Export failed:', err);
      reject(err);
    }
  });
};

/**
 * Helper to download a data URL as a file
 */
export const downloadDataUrl = (dataUrl: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

/**
 * Format current date for filenames and display
 */
export const getFormattedDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};