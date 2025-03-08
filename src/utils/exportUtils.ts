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
      
      // Force map to refresh
      map.invalidateSize();
      
      // Wait for any animations to finish and tiles to load
      await new Promise(resolve => {
        map.once('moveend', () => {
          setTimeout(resolve, 1000); // Additional delay for tiles
        });
        map.panBy([1, 0], { animate: false });
      });

      // Create clone container with same dimensions
      const tempContainer = document.createElement('div');
      tempContainer.style.cssText = `
        position: absolute;
        left: -9999px;
        width: ${container.clientWidth}px;
        height: ${container.clientHeight}px;
      `;
      document.body.appendChild(tempContainer);

      // Clone map container
      const clone = container.cloneNode(true) as HTMLElement;
      tempContainer.appendChild(clone);

      // Process all panes to ensure correct stacking and visibility
      const panes = clone.querySelectorAll('.leaflet-pane');
      panes.forEach(pane => {
        if (pane instanceof HTMLElement) {
          pane.style.position = 'absolute';
          pane.style.visibility = 'visible';
          pane.style.transform = 'none'; // Reset any transforms
          
          // For overlay pane, ensure it's on top
          if (pane.classList.contains('leaflet-overlay-pane')) {
            pane.style.zIndex = '400';
          }
        }
      });

      // Find all path elements (polygons) and ensure they're visible
      const paths = clone.querySelectorAll('path');
      paths.forEach(path => {
        if (path instanceof SVGElement) {
          path.style.visibility = 'visible';
          // Preserve fill colors and opacity
          const fill = path.getAttribute('fill');
          if (fill?.includes('url(#hatchPattern)')) {
            // Force pattern to be visible for significant threats
            path.style.fill = fill;
            path.style.fillOpacity = '1';
          }
        }
      });

      // Fix SVG patterns
      const svgElements = clone.querySelectorAll('svg');
      svgElements.forEach(svg => {
        // Ensure svg is visible
        svg.style.display = 'block';
        svg.style.visibility = 'visible';
        
        // Find and clone the pattern definition if it exists
        const originalPattern = document.querySelector('#hatchPattern');
        if (originalPattern && svg.querySelector('defs')) {
          const patternClone = originalPattern.cloneNode(true);
          svg.querySelector('defs')?.appendChild(patternClone);
        }
      });

      // Ensure significant threat patterns are preserved
      const significantThreats = clone.querySelectorAll('.significant-threat-pattern');
      significantThreats.forEach(threat => {
        if (threat instanceof HTMLElement) {
          threat.style.position = 'relative';
          threat.style.zIndex = '999';
          // Add backup hatching using CSS
          const after = document.createElement('div');
          after.style.cssText = `
            content: '';
            position: absolute;
            inset: 0;
            background-image: repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8) 2px, transparent 2px, transparent 12px);
            background-size: 16px 16px;
            pointer-events: none;
            z-index: 999;
          `;
          threat.appendChild(after);
        }
      });

      // Capture the modified clone
      const canvas = await html2canvas(clone, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        scale: window.devicePixelRatio * 2,
        logging: false,
        width: container.clientWidth,
        height: container.clientHeight,
        foreignObjectRendering: false // Disable foreign object rendering for better compatibility
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