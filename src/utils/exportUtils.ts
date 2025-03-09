import L from 'leaflet';
import html2canvas from 'html2canvas';

interface ExportOptions {
  scale?: number;
}

/**
 * Core function to export the map view based on geographical coordinates
 */
export const exportMapAsImage = async (map: L.Map, options: ExportOptions = {}): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Store original map state
      const originalBounds = map.getBounds();
      const originalZoom = map.getZoom();
      
      // Get the map container
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

      // Create a new temporary map for rendering
      const tempMap = L.map(tempContainer, {
        center: originalBounds.getCenter(),
        zoom: originalZoom,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false
      });

      // Add the same tile layer as the original map
      map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
          const tileLayer = layer as L.TileLayer;
          // Use the internal _url property and original options
          L.tileLayer((tileLayer as any)._url || '', layer.options).addTo(tempMap);
        }
      });

      // Get all GeoJSON layers from the original map
      const geojsonLayers: Array<{
        feature: GeoJSON.Feature,
        style: L.PathOptions & { className?: string, zIndex?: number }
      }> = [];

      map.eachLayer(layer => {
        const geoJSONLayer = layer as any as L.GeoJSON;
        if (layer instanceof L.Path && geoJSONLayer.feature && 'type' in geoJSONLayer.feature) {
          const style = layer.options;
          geojsonLayers.push({
            feature: geoJSONLayer.feature as GeoJSON.Feature,
            style: style
          });
        }
      });

      // Sort layers by z-index to maintain proper stacking order
      geojsonLayers.sort((a, b) => {
        const zIndexA = a.style.zIndex || 0;
        const zIndexB = b.style.zIndex || 0;
        return zIndexA - zIndexB;
      });

      // Add layers to temp map with exact same styling
      geojsonLayers.forEach(({ feature, style }) => {
        L.geoJSON(feature, {
          style: () => ({
            ...style,
            // Ensure proper rendering of significant threats
            className: style.className
          })
        }).addTo(tempMap);
      });

      // Add hatch pattern definition
      const svgContainer = document.createElement('div');
      svgContainer.innerHTML = `
        <svg style="position: absolute; width: 0; height: 0;">
          <defs>
            <pattern 
              id="hatchPattern" 
              patternUnits="userSpaceOnUse" 
              width="10" 
              height="10"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="10" stroke="black" strokeWidth="2" />
              <line x1="10" y1="0" x2="10" y2="10" stroke="black" strokeWidth="2" />
            </pattern>
          </defs>
        </svg>
      `;
      tempContainer.appendChild(svgContainer);

      // Wait for tiles to load
      await new Promise<void>(resolve => {
        const checkTiles = () => {
          const loading = document.querySelectorAll('.leaflet-tile-loading').length;
          if (loading === 0) {
            setTimeout(resolve, 100); // Small delay to ensure everything is rendered
          } else {
            setTimeout(checkTiles, 100);
          }
        };
        checkTiles();
      });

      // Capture the map with proper scaling
      const canvas = await html2canvas(tempContainer, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        scale: options.scale || window.devicePixelRatio * 2,
        logging: false,
        width: container.clientWidth,
        height: container.clientHeight,
        onclone: (clonedDoc) => {
          // Ensure significant threats are properly rendered
          const threats = clonedDoc.querySelectorAll('.significant-threat-pattern');
          threats.forEach(threat => {
            if (threat instanceof HTMLElement) {
              threat.style.position = 'relative';
              threat.style.zIndex = '999';
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
        }
      });

      // Clean up
      tempMap.remove();
      document.body.removeChild(tempContainer);

      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    } catch (err) {
      console.error('Export failed:', err);
      reject(err);
    }
  });
};