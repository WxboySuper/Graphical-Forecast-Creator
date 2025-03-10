import L from 'leaflet';
import html2canvas from 'html2canvas';

// Extended layer type with proper options
interface ExtendedLayer extends L.Layer {
  toGeoJSON(): GeoJSON.Feature;
  options: L.PathOptions & {
    className?: string;
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    weight?: number;
    opacity?: number;
  };
}

/**
 * Exports the current map view as a PNG image
 * @param map The Leaflet map instance to export
 * @param title Optional title to add to the image
 */
export const exportMapAsImage = async (map: L.Map, title?: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Store original map state
      const originalBounds = map.getBounds();
      const originalZoom = map.getZoom();
      const originalCenter = map.getCenter();

      // Get map container
      const container = map.getContainer();

      // Create an offscreen container for the new map
      const tempContainer = document.createElement('div');
      tempContainer.style.cssText = `
        position: absolute;
        left: -9999px;
        width: ${container.clientWidth}px;
        height: ${container.clientHeight}px;
        `;
      document.body.appendChild(tempContainer);
      
      // Create a temporary map for export with current view
      const tempMap = L.map(tempContainer, {
        center: originalCenter,
        zoom: originalZoom,
        crs: map.options.crs || L.CRS.EPSG3857,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false
      });
      
      // Add the same tile layer
      await new Promise<void>((resolve) => {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(tempMap).on('load', () => resolve());
      });
      
      tempMap.fitBounds(originalBounds, {
        animate: false,
        padding: [0, 0]
      })
      
      tempMap.invalidateSize({animate: false});

      // First add non-significant layers
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) return; // Skip the base tile layer
        
        const pathLayer = layer as ExtendedLayer;
        if ('toGeoJSON' in pathLayer) {
          if (!pathLayer.options.className?.includes('significant-threat-pattern')) {
            // Clone the path/polygon with its style
            const clonedLayer = L.geoJSON((pathLayer).toGeoJSON(), {
              style: function() {
                return {
                  color: pathLayer.options.color || '#000000',
                  fillColor: pathLayer.options.fillColor || '#000000',
                  fillOpacity: pathLayer.options.fillOpacity || 0.2,
                  weight: pathLayer.options.weight || 2,
                  opacity: pathLayer.options.opacity || 1
                };
              }
            });
            clonedLayer.addTo(tempMap);
          }
        }
      });

      // Then add significant layers with hatching on top
      map.eachLayer((layer) => {
        if ('toGeoJSON' in layer) {
          const pathLayer = layer as ExtendedLayer;
          if (pathLayer.options.className?.includes('significant-threat-pattern')) {
            // Clone the path/polygon with its style plus hatching
            const clonedLayer = L.geoJSON((pathLayer).toGeoJSON(), {
              style: function() {
                return {
                  color: pathLayer.options.color || '#000000',
                  fillColor: pathLayer.options.fillColor || '#000000',
                  fillOpacity: pathLayer.options.fillOpacity || 0.2,
                  weight: pathLayer.options.weight || 2,
                  opacity: pathLayer.options.opacity || 1,
                  className: 'significant-threat-pattern'
                };
              }
            });
            clonedLayer.addTo(tempMap);
          }
        }
      });
      
      // Wait for all tiles to load
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // If title is provided, add it to the map
      if (title) {
        const titleDiv = document.createElement('div');
        titleDiv.style.position = 'absolute';
        titleDiv.style.top = '20px';
        titleDiv.style.left = '20px';
        titleDiv.style.zIndex = '1000';
        titleDiv.style.backgroundColor = 'rgba(255,255,255,0.9)';
        titleDiv.style.padding = '10px 20px';
        titleDiv.style.borderRadius = '4px';
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.fontSize = '18px';
        titleDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        titleDiv.innerHTML = title;
        container.appendChild(titleDiv);
      }
      
      // Add a footer with attribution
      const footerDiv = document.createElement('div');
      footerDiv.style.position = 'absolute';
      footerDiv.style.bottom = '20px';
      footerDiv.style.right = '20px';
      footerDiv.style.zIndex = '1000';
      footerDiv.style.backgroundColor = 'rgba(255,255,255,0.9)';
      footerDiv.style.padding = '8px 12px';
      footerDiv.style.borderRadius = '4px';
      footerDiv.style.fontSize = '12px';
      footerDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      footerDiv.innerHTML = `Created with Graphical Forecast Creator | ${getFormattedDate()} | © OpenStreetMap contributors`;
      container.appendChild(footerDiv);
      
      // Use html2canvas with improved settings for better quality
      const canvas = await html2canvas(container, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        scale: 2, // Increased scale for better quality
        logging: false,
        width: 1200,
        height: 800
      });
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/png');
      
      // Clean up
      document.body.removeChild(container);
      tempMap.remove();
      
      resolve(dataUrl);
    } catch (err) {
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