import L from 'leaflet';
import html2canvas from 'html2canvas';

/**
 * Exports the current map view as a PNG image
 * @param map The Leaflet map instance to export
 * @param title Optional title to add to the image
 */
export const exportMapAsImage = async (map: L.Map, title?: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Create a container to hold a copy of the map for export
      const container = document.createElement('div');
      container.style.width = '1200px';
      container.style.height = '800px';
      container.style.position = 'absolute';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      document.body.appendChild(container);
      
      // Create a temporary map for export with current view
      const exportMap = L.map(container, {
        center: map.getCenter(),
        zoom: map.getZoom(),
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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(exportMap);
      
      // Clone all the visible layers from the original map
      // Note: This is a simplified approach and might not capture all custom styles
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) return; // Skip the base tile layer
        
        if (layer instanceof L.Path || layer instanceof L.Polygon) {
          // Clone the path/polygon with its style
          const clonedLayer = L.geoJSON(layer.toGeoJSON(), {
            style: function() {
              return {
                color: layer.options.color,
                fillColor: layer.options.fillColor,
                fillOpacity: layer.options.fillOpacity,
                weight: layer.options.weight,
                opacity: layer.options.opacity,
                className: layer.options.className
              };
            }
          });
          clonedLayer.addTo(exportMap);
        }
      });
      
      // Wait for the map to render
      setTimeout(async () => {
        try {
          // If title is provided, add it to the map
          if (title) {
            const titleDiv = document.createElement('div');
            titleDiv.style.position = 'absolute';
            titleDiv.style.top = '10px';
            titleDiv.style.left = '10px';
            titleDiv.style.zIndex = '1000';
            titleDiv.style.backgroundColor = 'rgba(255,255,255,0.8)';
            titleDiv.style.padding = '10px';
            titleDiv.style.borderRadius = '4px';
            titleDiv.style.fontWeight = 'bold';
            titleDiv.style.fontSize = '18px';
            titleDiv.innerHTML = title;
            container.appendChild(titleDiv);
          }
          
          // Add a footer with attribution
          const footerDiv = document.createElement('div');
          footerDiv.style.position = 'absolute';
          footerDiv.style.bottom = '10px';
          footerDiv.style.right = '10px';
          footerDiv.style.zIndex = '1000';
          footerDiv.style.backgroundColor = 'rgba(255,255,255,0.8)';
          footerDiv.style.padding = '5px';
          footerDiv.style.borderRadius = '4px';
          footerDiv.style.fontSize = '12px';
          footerDiv.innerHTML = 'Created with Graphical Forecast Creator | © OpenStreetMap contributors';
          container.appendChild(footerDiv);
          
          // Use html2canvas to capture the map as an image
          const canvas = await html2canvas(container, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#fff'
          });
          
          // Convert canvas to data URL
          const dataUrl = canvas.toDataURL('image/png');
          
          // Clean up
          document.body.removeChild(container);
          exportMap.remove();
          
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      }, 1000); // Give the map a second to fully render
      
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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};