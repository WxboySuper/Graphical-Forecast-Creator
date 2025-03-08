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
  let container: HTMLDivElement | null = null;
  let mapStyles: HTMLStyleElement | null = null;
  let exportMap: L.Map | null = null;
  let featureGroup: L.FeatureGroup | null = null;

  return new Promise(async (resolve, reject) => {
    try {
      // Create a container to hold a copy of the map for export
      container = document.createElement('div');
      container.style.width = '1200px';
      container.style.height = '800px';
      container.style.position = 'absolute';  // Changed back to absolute
      container.style.left = '-9999px';      // Move off-screen
      container.style.top = '-9999px';       // Move off-screen
      container.style.backgroundColor = '#fff';
      container.className = 'export-map-container';
      
      // Add map container styles
      mapStyles = document.createElement('style');
      mapStyles.textContent = `
        .export-map-container .leaflet-container {
          width: 1200px !important;
          height: 800px !important;
          background: #fff !important;
        }
      `;
      document.head.appendChild(mapStyles);
      document.body.appendChild(container);

      // Create a temporary map for export
      exportMap = L.map(container, {
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

      // Force a map size update
      exportMap.invalidateSize({animate: false, duration: 0});

      // Add the tile layer first
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(exportMap);

      // Wait for tiles to load
      await new Promise<void>((resolve) => {
        const checkTiles = () => {
          if (tileLayer.isLoading()) {
            setTimeout(checkTiles, 100);
          } else {
            setTimeout(resolve, 500); // Give extra time for rendering
          }
        };
        checkTiles();
      });

      // Create a feature group for the layers
      featureGroup = L.featureGroup().addTo(exportMap);

      // Add non-significant layers first
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) return;
        
        const pathLayer = layer as ExtendedLayer;
        if ('toGeoJSON' in pathLayer && !pathLayer.options.className?.includes('significant-threat-pattern')) {
          try {
            const geoJson = pathLayer.toGeoJSON();
            // Create a new layer with exact style copying
            const clonedLayer = L.geoJSON(geoJson, {
              style: () => {
                const originalStyle = { ...pathLayer.options };
                delete originalStyle.className; // Remove className to prevent style conflicts
                return originalStyle;
              }
            });
            if (featureGroup) featureGroup.addLayer(clonedLayer);
          } catch (e) {
            console.warn('Failed to clone layer:', e);
          }
        }
      });

      // Add significant layers on top
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) return;
        
        const pathLayer = layer as ExtendedLayer;
        if ('toGeoJSON' in pathLayer && pathLayer.options.className?.includes('significant-threat-pattern')) {
          try {
            const geoJson = pathLayer.toGeoJSON();
            // Create a new layer with exact style copying
            const clonedLayer = L.geoJSON(geoJson, {
              style: () => {
                const originalStyle = { ...pathLayer.options };
                // Ensure the significant pattern class is preserved
                originalStyle.className = 'significant-threat-pattern';
                return originalStyle;
              }
            });
            if (featureGroup) featureGroup.addLayer(clonedLayer);
          } catch (e) {
            console.warn('Failed to clone significant layer:', e);
          }
        }
      });

      // Fit bounds if we have features
      if (featureGroup && featureGroup.getLayers().length > 0) {
        exportMap.fitBounds(featureGroup.getBounds(), {
          padding: [20, 20]
        });
      }

      // Wait for rendering
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Add title if provided
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
        titleDiv.innerHTML = title;
        container.appendChild(titleDiv);
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
      container.appendChild(footerDiv);

      // Wait a bit longer for rendering to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Capture the map with improved html2canvas settings
      const canvas = await html2canvas(container, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        scale: 2,
        width: 1200,
        height: 800,
        logging: true,  // Enable logging to debug issues
        foreignObjectRendering: true,
        removeContainer: true,
        async: true,
        ignoreElements: (element) => {
          // Only render map-related elements
          return !(
            element.classList.contains('leaflet-tile-container') ||
            element.classList.contains('leaflet-overlay-pane') ||
            element.classList.contains('leaflet-marker-pane') ||
            element.classList.contains('export-map-container') ||
            element.tagName === 'CANVAS'
          );
        }
      });

      // Ensure we have valid canvas data before proceeding
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Canvas generation failed');
      }

      const dataUrl = canvas.toDataURL('image/png');
      
      // Clean up before resolving
      cleanup();
      
      resolve(dataUrl);
    } catch (err) {
      console.error('Export failed:', err);
      reject(err);
    } finally {
      // Ensure cleanup happens even if there's an error
      cleanup();
    }
  });

  function cleanup() {
    try {
      if (featureGroup) {
        featureGroup.eachLayer((layer) => {
          layer.remove();
        });
        featureGroup.clearLayers();
        featureGroup.remove();
        featureGroup = null;
      }
      if (exportMap) {
        exportMap.eachLayer((layer) => {
          layer.remove();
        });
        exportMap.remove();
        exportMap = null;
      }
      if (container && document.body.contains(container)) {
        document.body.removeChild(container);
        container = null;
      }
      if (mapStyles && document.head.contains(mapStyles)) {
        document.head.removeChild(mapStyles);
        mapStyles = null;
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
  }
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