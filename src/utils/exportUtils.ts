import L from 'leaflet';
import html2canvas from 'html2canvas';

/**
 * Exports the current map view as a PNG image
 * @param map The Leaflet map instance to export
 * @param title Optional title to add to the image
 */
export const exportMapAsImage = async (map: L.Map, title?: string): Promise<string> => {
  // Store original map container
  const originalContainer = map.getContainer();
  const originalStyle = window.getComputedStyle(originalContainer);
  
  // Store original dimensions and position
  const originalWidth = originalStyle.width;
  const originalHeight = originalStyle.height;
  const originalPosition = originalStyle.position;

  return new Promise(async (resolve, reject) => {
    try {
      // Temporarily modify the map container for export
      originalContainer.style.width = '1200px';
      originalContainer.style.height = '800px';
      originalContainer.style.position = 'fixed';
      originalContainer.style.top = '0';
      originalContainer.style.left = '0';
      originalContainer.style.zIndex = '999999';

      // Force a map size update
      map.invalidateSize({animate: false, duration: 0});

      // Add title if provided
      let titleDiv: HTMLDivElement | null = null;
      if (title) {
        titleDiv = document.createElement('div');
        titleDiv.style.position = 'absolute';
        titleDiv.style.top = '20px';
        titleDiv.style.left = '20px';
        titleDiv.style.zIndex = '1000';
        titleDiv.style.backgroundColor = 'rgba(255,255,255,0.9)';
        titleDiv.style.padding = '10px 20px';
        titleDiv.style.borderRadius = '4px';
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.fontSize = '18px';
        titleDiv.innerHTML = title;
        originalContainer.appendChild(titleDiv);
      }

      // Add attribution
      const footerDiv = document.createElement('div');
      footerDiv.style.position = 'absolute';
      footerDiv.style.bottom = '20px';
      footerDiv.style.right = '20px';
      footerDiv.style.zIndex = '1000';
      footerDiv.style.backgroundColor = 'rgba(255,255,255,0.9)';
      footerDiv.style.padding = '8px 12px';
      footerDiv.style.borderRadius = '4px';
      footerDiv.style.fontSize = '12px';
      footerDiv.innerHTML = `Created with Graphical Forecast Creator | ${getFormattedDate()} | © OpenStreetMap contributors`;
      originalContainer.appendChild(footerDiv);

      // Wait for any tile loading to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Capture the map
      const canvas = await html2canvas(originalContainer, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        scale: 2,
        width: 1200,
        height: 800,
        logging: false
      });

      // Restore original container state
      originalContainer.style.width = originalWidth;
      originalContainer.style.height = originalHeight;
      originalContainer.style.position = originalPosition;
      originalContainer.style.top = '';
      originalContainer.style.left = '';
      originalContainer.style.zIndex = '';

      // Remove temporary elements
      if (titleDiv) {
        originalContainer.removeChild(titleDiv);
      }
      originalContainer.removeChild(footerDiv);

      // Force a map size update to restore the original view
      map.invalidateSize({animate: false, duration: 0});

      // Convert to data URL and resolve
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    } catch (err) {
      console.error('Export failed:', err);
      reject(err);
    }
  });
};

/**
 * Downloads a data URL as a file
 * @param dataUrl The data URL to download
 * @param filename The filename to save as
 */
export const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

/**
 * Helper function to get the current date formatted as YYYY-MM-DD
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