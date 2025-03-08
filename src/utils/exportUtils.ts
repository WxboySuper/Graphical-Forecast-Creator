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
      
      // Force a map redraw and wait for it to complete
      map.invalidateSize();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create a temporary container for the clone
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.width = container.clientWidth + 'px';
      tempContainer.style.height = container.clientHeight + 'px';
      document.body.appendChild(tempContainer);

      // Clone the map container
      const clone = container.cloneNode(true) as HTMLElement;
      tempContainer.appendChild(clone);

      // Fix SVG patterns in the clone
      const svgElements = clone.querySelectorAll('svg');
      svgElements.forEach(svg => {
        // Ensure pattern definitions are present
        const defs = svg.querySelector('defs');
        if (defs) {
          const pattern = defs.querySelector('pattern');
          if (pattern) {
            // Force pattern to be visible
            pattern.setAttribute('patternTransform', 'rotate(45)');
            const path = pattern.querySelector('path');
            if (path) {
              path.setAttribute('stroke-width', '2');
              path.setAttribute('opacity', '0.8');
            }
          }
        }
      });

      // Apply styles to ensure significant threat patterns are visible
      const significantThreats = clone.querySelectorAll('.significant-threat-pattern');
      significantThreats.forEach(threat => {
        if (threat instanceof HTMLElement) {
          threat.style.position = 'relative';
          const after = document.createElement('div');
          after.style.cssText = `
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8) 2px, transparent 2px, transparent 12px);
            background-size: 16px 16px;
            pointer-events: none;
            z-index: 999;
          `;
          threat.appendChild(after);
        }
      });

      // Capture the cloned and modified map
      const canvas = await html2canvas(clone, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        scale: window.devicePixelRatio * 2,
        logging: false,
        width: container.clientWidth,
        height: container.clientHeight,
      });

      // Clean up
      document.body.removeChild(tempContainer);

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