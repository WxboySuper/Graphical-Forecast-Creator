// skipcq: JS-C1003
import * as L from 'leaflet';
import html2canvas from 'html2canvas';
import { OutlookData, OutlookType } from '../types/outlooks';
import { colorMappings } from './outlookUtils';
import { store } from '../store';

type ExportMapLike = {
  getContainer?: () => HTMLElement;
  getTargetElement?: () => HTMLElement;
};

const isLeafletMap = (map: unknown): map is L.Map => {
  return Boolean(map && typeof (map as L.Map).getContainer === 'function' && typeof (map as L.Map).getBounds === 'function');
};

const getExportContainer = (map: ExportMapLike): HTMLElement | null => {
  if (map.getContainer) {
    return map.getContainer();
  }

  if (map.getTargetElement) {
    return map.getTargetElement();
  }

  return null;
};

export type ExportImageFormat = 'png' | 'jpeg';

export interface ExportImageOptions {
  title?: string;
  format?: ExportImageFormat;
  quality?: number;
  includeLegendAndStatus?: boolean;
}

/**
 * Get the style for a feature based on outlook type and probability
 */
const getFeatureStyle = (outlookType: OutlookType, probability: string): L.PathOptions => {
  // Use a lookup to avoid branching and reduce cyclomatic complexity
  const palettes: Record<string, Record<string, string>> = {
    categorical: colorMappings.categorical as Record<string, string>,
    tornado: colorMappings.tornado as Record<string, string>,
    wind: colorMappings.wind as Record<string, string>,
    hail: colorMappings.hail as Record<string, string>,
    totalSevere: colorMappings.totalSevere as Record<string, string>,
    'day4-8': colorMappings['day4-8'] as Record<string, string>
  };

  const color = palettes[outlookType]?.[probability] ?? '#FFFFFF';
  
  // Check for CIG (Hatching)
  if (probability.startsWith('CIG')) {
      // In export, we might just use transparency or a placeholder if patterns aren't supported.
      // But we should try to support them if possible.
      // Since html2canvas captures the DOM, if we use the same URL patterns, they might work
      // if the definitions are available in the document.
      const patternUrl = colorMappings.hatching[probability as keyof typeof colorMappings.hatching];
      return {
          color: '#000000',
          weight: 1,
          opacity: 1,
          fillColor: patternUrl || 'none',
          fillOpacity: 1,
          className: 'hatching-layer'
      };
  }

  // Legacy significance check removed
  return {
    color: '#000000',
    fillColor: color,
    fillOpacity: 0.4,
    weight: 2,
    opacity: 1
  };
};

/**
 * Helper function to get the current date formatted as YYYY-MM-DD HH:MM
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

/**
 * Exports the current map view as a PNG image.
 * 
 * Uses the ORIGINAL approach that was working: fitBounds instead of setView.
 * The key is using fitBounds with the EXACT bounds from the original map.
 * 
 * @param map The Leaflet map instance to export
 * @param outlooks The outlook data from Redux store  
 * @param title Optional title to add to the image
 */
// Helper: create offscreen container sized like the original
const createTempContainer = (width: number, height: number): HTMLDivElement => {
  const temp = document.createElement('div');
  temp.style.cssText = `position:absolute;left:-9999px;width:${width}px;height:${height}px;`;
  document.body.appendChild(temp);
  return temp;
};

// Helper: create a temporary Leaflet map instance
const createTempMap = (container: HTMLElement, center: L.LatLng, zoom: number, crs: L.CRS): L.Map => {
  return L.map(container, {
    center,
    zoom,
    crs: crs || L.CRS.EPSG3857,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
  });
};

// Helper: add tiles to map and wait for load or timeout
const addTilesAndWait = (mapInstance: L.Map, sourceMap: L.Map, timeout = 5000): Promise<{ timedOut: boolean; remaining: number }> => {
  return new Promise((resolve) => {
    const activeTileLayers: L.TileLayer[] = [];
    sourceMap.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        activeTileLayers.push(layer as L.TileLayer);
      }
    });

    // Fallback to a default single OSM layer if none found
    const layersToAdd = activeTileLayers.length > 0 ? activeTileLayers : [L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { crossOrigin: 'anonymous' })];

    let resolved = false;
    let pendingTiles = 0;

    const finish = (fromTimeout = false) => {
      if (!resolved) {
        resolved = true;
        resolve({ timedOut: fromTimeout, remaining: pendingTiles });
      }
    };

    const addAndWatch = (srcLayer: L.TileLayer) => {
      // Derive a best-effort URL: prefer options.url, then getTileUrl if available, then any private _url
      const srcAny = srcLayer as any;
      const derivedUrl = srcAny?.options?.url ?? (typeof srcAny.getTileUrl === 'function' ? srcAny.getTileUrl({ x: 0, y: 0, z: srcAny.options?.maxZoom ?? 0 }) : undefined) ?? srcAny?._url;
      const attribution = (srcLayer.options?.attribution as string | undefined) ?? '© OpenStreetMap contributors';
      const maxZoom = srcLayer.options?.maxZoom ?? 19;
      const layer = L.tileLayer(derivedUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution,
        maxZoom,
        crossOrigin: 'anonymous'
      });

      layer.on('tileloadstart', () => {
        pendingTiles += 1;
      });

      layer.on('tileload', () => {
        pendingTiles = Math.max(0, pendingTiles - 1);
        if (pendingTiles === 0) finish(false);
      });

      layer.on('tileerror', () => {
        pendingTiles = Math.max(0, pendingTiles - 1);
        if (pendingTiles === 0) finish(false);
      });

      layer.on('load', () => finish(false));
      layer.addTo(mapInstance);
    };

    // Add and watch all derived layers
    layersToAdd.forEach(addAndWatch);

    // Safety timeout
    setTimeout(() => finish(true), timeout);
  });
};

// Helper to sort probabilities (extracted)
const sortProbabilities = (entries: [string, GeoJSON.Feature[]][]): [string, GeoJSON.Feature[]][] => {
  return entries.sort((a, b) => {
    const [probA, probB] = [a[0], b[0]];

    // CIG levels come after numeric probabilities (render on top)
    const isCigA = probA.startsWith('CIG');
    const isCigB = probB.startsWith('CIG');
    
    if (isCigA !== isCigB) {
      return isCigA ? 1 : -1;
    }
    
    if (isCigA && isCigB) {
      return probA.localeCompare(probB);
    }

    if (probA === 'TSTM') return -1;
    if (probB === 'TSTM') return 1;

    const riskOrder: Record<string, number> = { 'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5 };
    if (riskOrder[probA] !== undefined && riskOrder[probB] !== undefined) return riskOrder[probA] - riskOrder[probB];
    const getPercentValue = (prob: string) => parseInt(prob.replace(/[^0-9]/g, '')) || 0;
    return getPercentValue(probA) - getPercentValue(probB);  });
};

// Helper: render outlooks onto a map instance
const renderOutlooksToMap = (mapInstance: L.Map, outlooks: OutlookData) => {
  const outlookOrder: OutlookType[] = ['categorical', 'tornado', 'wind', 'hail', 'totalSevere', 'day4-8'];
  outlookOrder.forEach((outlookType) => {
    const outlookMap = outlooks[outlookType];
    if (!outlookMap) return;
    const entries = Array.from(outlookMap.entries()) as [string, GeoJSON.Feature[]][];
    const sortedEntries = sortProbabilities(entries);
    sortedEntries.forEach(([probability, features]) => {
      const styleOptions = getFeatureStyle(outlookType, probability);
      features.forEach(feature => {
        L.geoJSON(feature, { style: () => styleOptions }).addTo(mapInstance);
      });
    });
  });
};

// Helper: add title/footer/status and unofficial overlays
const addOverlays = (container: HTMLElement, title?: string, statusText?: string, unofficialText?: string) => {
  const doc = container.ownerDocument;
  const isDarkMode = store.getState().theme.darkMode;

  // Status overlay recreated from text so html2canvas does not reflow flex styles.
  if (statusText) {
    const wrapperDiv = doc.createElement('div');
    wrapperDiv.style.cssText = 'position:absolute;top:12px;left:0;width:100%;text-align:center;z-index:1400;pointer-events:none;';
    const badgeBg = isDarkMode ? '#3a3a3a' : 'rgba(34,34,34,0.85)';
    const badgeColor = isDarkMode ? '#e4e4e4' : '#ffffff';
    const badgeBorder = isDarkMode ? 'border:1px solid #404040;' : '';
    const badgeDiv = doc.createElement('div');
    // Keep badge (shape) in normal position; move text up by 10px only for export
    badgeDiv.style.cssText = `display:inline-block;background-color:${badgeBg};color:${badgeColor};padding:0 18px;height:34px;line-height:28px;border-radius:17px;font-weight:bold;font-size:14px;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,0.5);${badgeBorder}`;
    // create inner span for text so we can nudge text without moving the pill shape
    const badgeTextSpan = doc.createElement('span');
    badgeTextSpan.textContent = statusText;
    badgeTextSpan.style.cssText = 'display:inline-block;position:relative;top:-5px;';
    badgeDiv.appendChild(badgeTextSpan);
    wrapperDiv.appendChild(badgeDiv);
    container.appendChild(wrapperDiv);
  }

  // Unofficial badge recreated from text to avoid html2canvas baseline drift.
  if (unofficialText) {
    const unofficialWrapper = doc.createElement('div');
    unofficialWrapper.style.cssText = 'position:absolute;bottom:8px;left:0;right:0;text-align:center;z-index:1300;pointer-events:none;';

    const innerBg = 'rgba(20,20,20,0.62)';
    const innerColor = '#f0f0f0';
    const innerDiv = doc.createElement('div');
    innerDiv.style.cssText = `display:inline-block;background:${innerBg};color:${innerColor};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:0 10px;height:22px;line-height:16px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);white-space:nowrap;`;

    const dot = doc.createElement('span');
    dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;margin-right:6px;vertical-align:middle;';

    const text = doc.createElement('span');
    text.textContent = unofficialText;
    // Move bottom badge text up by 1px for exported image alignment
    text.style.cssText = 'display:inline-block;vertical-align:middle;position:relative;top:-7px;';

    innerDiv.appendChild(dot);
    innerDiv.appendChild(text);
    unofficialWrapper.appendChild(innerDiv);
    container.appendChild(unofficialWrapper);
  }

  if (title) {
    const titleDiv = doc.createElement('div');
    const bg = isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)';
    const text = isDarkMode ? '#e4e4e4' : '#212529';
    titleDiv.style.cssText = `position:absolute;top:20px;left:20px;z-index:1000;background-color:${bg};color:${text};padding:10px 20px;border-radius:4px;font-weight:bold;font-size:18px;box-shadow:0 2px 4px rgba(0,0,0,0.2);`;
    titleDiv.textContent = title;
    container.appendChild(titleDiv);
  }

  const footerDiv = doc.createElement('div');
  const bg = isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)';
  const text = isDarkMode ? '#e4e4e4' : '#212529';
  footerDiv.style.cssText = `position:absolute;bottom:20px;right:20px;z-index:1000;background-color:${bg};color:${text};padding:8px 12px;border-radius:4px;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);`;
  footerDiv.innerHTML = `Created with Graphical Forecast Creator | ${getFormattedDate()} | © OpenStreetMap contributors`;
  container.appendChild(footerDiv);
};

const cloneLegendAndStatusOverlays = (sourceMap: L.Map, exportContainer: HTMLElement) => {
  const sourceContainer = sourceMap.getContainer();
  const sourceRoot = sourceContainer.closest('.map-container, .forecast-map-container') || sourceContainer;

  // Only clone the legend — status overlay is recreated fresh via addOverlays to avoid
  // html2canvas issues with CSS transforms and color inheritance on cloned elements.
  const legend = sourceRoot.querySelector('.map-legend');
  if (legend) {
    const clone = legend.cloneNode(true) as HTMLElement;
    clone.style.pointerEvents = 'none';
    exportContainer.appendChild(clone);
  }
};

const readStatusText = (root: HTMLElement): string =>
  root.querySelector('.gfc-status-badge')?.getAttribute('aria-label') ??
  root.querySelector('.gfc-status-badge')?.textContent?.trim() ??
  '';

const readUnofficialText = (root: HTMLElement): string =>
  root.querySelector('.unofficial-badge-inner')?.textContent?.trim() ??
  '';

// Helper: capture container to data URL
const captureContainer = async (
  container: HTMLElement,
  width: number,
  height: number,
  format: ExportImageFormat,
  quality: number,
  onClone?: (clonedContainer: HTMLElement) => void
): Promise<string> => {
  const captureId = `gfc-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  container.setAttribute('data-gfc-export-capture-id', captureId);

  const canvas = await html2canvas(container, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: store.getState().theme.darkMode ? '#000000' : '#ffffff',
    scale: 2,
    imageTimeout: 8000,
    logging: false,
    width,
    height,
    onclone: (clonedDocument) => {
      const clonedContainer = clonedDocument.querySelector(`[data-gfc-export-capture-id="${captureId}"]`) as HTMLElement | null;
      if (clonedContainer) {
        // Ensure cloned container has explicit background matching current theme so dark tiles aren't lost
        clonedContainer.style.backgroundColor = store.getState().theme.darkMode ? '#000000' : '#ffffff';
        // Ensure cloned images request CORS so html2canvas can load external tiles
        Array.from(clonedContainer.querySelectorAll('img')).forEach((img) => {
          try { (img as HTMLImageElement).crossOrigin = 'anonymous'; } catch {}
        });
        // Copy any <defs> from SVGs in the source document into the cloned document so patterns/hatching render
        try {
          const srcDefs = Array.from(document.querySelectorAll('svg defs')) as Element[];
          if (srcDefs.length > 0) {
            let svgHolder = clonedDocument.querySelector('#gfc-export-svg-defs-holder') as Element | null;
            if (!svgHolder) {
              svgHolder = clonedDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
              svgHolder.setAttribute('id', 'gfc-export-svg-defs-holder');
              svgHolder.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;');
              clonedDocument.body.appendChild(svgHolder as unknown as HTMLElement);
            }
            srcDefs.forEach((d) => {
              try {
                const clonedDefs = d.cloneNode(true) as Node;
                svgHolder!.appendChild(clonedDefs as unknown as Node);
              } catch {}
            });
          }
        } catch {}

        if (onClone) {
          onClone(clonedContainer);
        }
      }
    }
  });

  container.removeAttribute('data-gfc-export-capture-id');

  if (format === 'jpeg') {
    return canvas.toDataURL('image/jpeg', quality);
  }

  return canvas.toDataURL('image/png');
};

const waitForMapSettle = (map: L.Map, timeout = 1200): Promise<void> => {
  return new Promise((resolve) => {
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    map.once('moveend', finish);
    setTimeout(finish, timeout);
  });
};

const waitForMapSettleGeneric = async (map: unknown, timeout = 1200): Promise<void> => {
  if (isLeafletMap(map)) {
    await waitForMapSettle(map, timeout);
    return;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    if (map && typeof (map as any).once === 'function') {
      try {
        (map as any).once('rendercomplete', finish);
      } catch (err) {
        // Fallback
      }
    }

    setTimeout(finish, timeout);
  });
};

const waitForImagesLoaded = async (root: HTMLElement, timeout = 1200): Promise<{ timedOut: boolean; remaining: number }> => {
  return new Promise((resolve) => {
    try {
      const imgs = Array.from(root.querySelectorAll('img'));
      if (imgs.length === 0) {
        // no images to wait for; short delay to allow backgrounds to settle
        setTimeout(() => resolve({ timedOut: false, remaining: 0 }), 50);
        return;
      }

      let remaining = imgs.length;
      let resolved = false;

      const finishOne = () => {
        remaining = Math.max(0, remaining - 1);
        if (remaining === 0 && !resolved) {
          resolved = true;
          resolve({ timedOut: false, remaining: 0 });
        }
      };

      imgs.forEach((i) => {
        const img = i as HTMLImageElement;
        if (img.complete) {
          finishOne();
        } else {
          img.addEventListener('load', finishOne, { once: true });
          img.addEventListener('error', finishOne, { once: true });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ timedOut: true, remaining });
        }
      }, timeout);
    } catch {
      setTimeout(() => resolve({ timedOut: true, remaining: -1 }), timeout);
    }
  });
};

const hideElementsInClone = (root: HTMLElement, selectors: string[]) => {
  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
  });
};

const exportLiveMapAsImage = async (
  map: ExportMapLike,
  options: ExportImageOptions
): Promise<string> => {
  const {
    title,
    format = 'png',
    quality = 0.92,
    includeLegendAndStatus = false
  } = options;

  const mapContainer = getExportContainer(map);
  if (!mapContainer) {
    throw new Error('Map container not available for export.');
  }

  const exportRoot = (mapContainer.closest('.map-container, .forecast-map-container') as HTMLElement | null) || mapContainer;
  const width = exportRoot.clientWidth;
  const height = exportRoot.clientHeight;

  // Read overlays from live DOM before html2canvas clones/reflows styles
  const statusText = includeLegendAndStatus ? readStatusText(exportRoot) : '';
  const unofficialText = includeLegendAndStatus ? readUnofficialText(exportRoot) : '';

  await waitForMapSettleGeneric(map, 400);
  const imgResult = await waitForImagesLoaded(exportRoot, 1200);
  if (imgResult?.timedOut && imgResult.remaining > 0) {
    // Inform developers/users via console and show an on-screen warning so it's obvious this is a network/tile load issue
    console.warn('GFC export: Some map tiles/images did not finish loading before capture; this is usually caused by a slow internet connection. Export may be incomplete.');
    try {
      const warningBanner = document.createElement('div');
      warningBanner.setAttribute('data-gfc-export-warning', '1');
      // position within the export root so it appears in the export and on-screen
      warningBanner.style.cssText = 'position:absolute;top:12px;left:12px;z-index:1600;background:rgba(255,69,58,0.95);color:#fff;padding:8px 12px;border-radius:6px;font-weight:600;font-size:12px;pointer-events:none;';
      warningBanner.textContent = 'Warning: Map tiles timed out loading — check your internet connection. Export may be incomplete.';
      exportRoot.appendChild(warningBanner);
      // remove after a short duration so it doesn't permanently alter the UI
      setTimeout(() => { try { warningBanner.remove(); } catch {} }, 6000);
    } catch {}
  }

  return captureContainer(exportRoot, width, height, format, quality, (clonedRoot) => {
    hideElementsInClone(clonedRoot, [
      '.leaflet-control-container',
      '.ol-control',
      '.map-toolbar-bottom-right',
      '.leaflet-pm-toolbar-container',
      '.leaflet-pm-actions-container',
      // Hide original overlays; recreated below with export-safe styles.
      '.gfc-status-overlay',
      '.unofficial-badge',
    ]);

    if (!includeLegendAndStatus) {
      hideElementsInClone(clonedRoot, ['.map-legend']);
    }

    addOverlays(clonedRoot, title, statusText || undefined, unofficialText || undefined);
  });
};

const exportViaTempMapAsImage = async (
  map: L.Map,
  outlooks: OutlookData,
  options: ExportImageOptions
): Promise<string> => {
  let tempContainer: HTMLDivElement | null = null;
  let tempMap: L.Map | null = null;

  const {
    title,
    format = 'png',
    quality = 0.92,
    includeLegendAndStatus = false
  } = options;

  try {
    const originalBounds = map.getBounds();
    const container = map.getContainer();
    tempContainer = createTempContainer(container.clientWidth, container.clientHeight);
    tempMap = createTempMap(tempContainer, map.getCenter(), map.getZoom(), map.options.crs || L.CRS.EPSG3857);
    tempMap.fitBounds(originalBounds, { animate: false, padding: [0, 0] });
    tempMap.invalidateSize({ animate: false });
    await waitForMapSettle(tempMap);
    const tileResult = await addTilesAndWait(tempMap, map);
    renderOutlooksToMap(tempMap, outlooks);
    await new Promise((r) => setTimeout(r, 300));
    if (tileResult?.timedOut && tileResult.remaining > 0) {
      console.warn('GFC export: temp map tiles did not finish loading before capture; this may be due to a slow internet connection and could cause blank or incomplete export.');
      try {
        const warnDiv = document.createElement('div');
        warnDiv.style.cssText = 'position:absolute;top:12px;left:12px;z-index:2000;background:rgba(255,69,58,0.95);color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600;pointer-events:none;';
        warnDiv.textContent = 'Warning: Map tiles timed out loading — export may be incomplete.';
        tempContainer.appendChild(warnDiv);
      } catch {}
    }
    const sourceRoot = (map.getContainer().closest('.map-container, .forecast-map-container') as HTMLElement | null) || map.getContainer();
    const statusText = includeLegendAndStatus ? readStatusText(sourceRoot) : '';
    const unofficialText = includeLegendAndStatus ? readUnofficialText(sourceRoot) : '';
    if (includeLegendAndStatus) {
      cloneLegendAndStatusOverlays(map, tempContainer);
    }
    addOverlays(tempContainer, title, statusText || undefined, unofficialText || undefined);
    return captureContainer(tempContainer, container.clientWidth, container.clientHeight, format, quality);
  } finally {
    try {
      if (tempContainer?.parentNode) {
        document.body.removeChild(tempContainer);
      }
    } catch {
      // ignore cleanup errors
    }

    try {
      if (tempMap?.remove) {
        tempMap.remove();
      }
    } catch {
      // ignore cleanup errors
    }
  }
};

export const exportMapAsImage = async (
  map: unknown,
  outlooks: OutlookData,
  options: ExportImageOptions = {}
): Promise<string> => {
  try {
    const exportMap = map as ExportMapLike;
    return await exportLiveMapAsImage(exportMap, options);
  } catch (error) {
    if (!isLeafletMap(map)) {
      throw error;
    }

    return exportViaTempMapAsImage(map, outlooks, options);
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