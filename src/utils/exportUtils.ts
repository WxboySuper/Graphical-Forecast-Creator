import { store } from '../store';

type ExportMapLike = {
  getTargetElement?: () => HTMLElement;
  once?: (event: 'rendercomplete', callback: () => void) => unknown;
  un?: (event: 'rendercomplete', callback: () => void) => void;
};

/** Returns the OpenLayers target element when the map is mounted. */
export const getExportContainer = (map: ExportMapLike): HTMLElement | null => {
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

// Overlay text for the exported image. Grouped so export helpers take one
// options object instead of several loose string arguments.
export interface OverlayOptions {
  title?: string;
  statusText?: string;
  unofficialText?: string;
}

// Helper: add title/footer/status and unofficial overlays
/** Adds the status pill to the export container. */
export const addStatusOverlay = (container: HTMLElement, statusText: string, isDarkMode: boolean) => {
  const doc = container.ownerDocument;
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
};

/** Adds the unofficial forecast badge to the export container. */
export const addUnofficialOverlay = (container: HTMLElement, unofficialText: string) => {
  const doc = container.ownerDocument;
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
};

/** Adds the title and footer overlays to the export container. */
export const addTitleAndFooter = (container: HTMLElement, options: OverlayOptions, isDarkMode: boolean) => {
  const doc = container.ownerDocument;
  if (options.title) {
    const titleDiv = doc.createElement('div');
    const bg = isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)';
    const text = isDarkMode ? '#e4e4e4' : '#212529';
    titleDiv.style.cssText = `position:absolute;top:20px;left:20px;z-index:1000;background-color:${bg};color:${text};padding:10px 20px;border-radius:4px;font-weight:bold;font-size:18px;box-shadow:0 2px 4px rgba(0,0,0,0.2);`;
    titleDiv.textContent = options.title;
    container.appendChild(titleDiv);
  }

  const footerDiv = doc.createElement('div');
  const bg = isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)';
  const text = isDarkMode ? '#e4e4e4' : '#212529';
  footerDiv.style.cssText = `position:absolute;bottom:20px;right:20px;z-index:1000;background-color:${bg};color:${text};padding:8px 12px;border-radius:4px;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);`;
  footerDiv.textContent = `Created with Graphical Forecast Creator | ${getFormattedDate()} | OpenStreetMap contributors`;
  container.appendChild(footerDiv);
};

/** Adds status, unofficial, title, and footer overlays to the export container. */
export const addOverlays = (container: HTMLElement, options: OverlayOptions = {}) => {
  const isDarkMode = store.getState().theme.darkMode;

  // Status overlay recreated from text so html2canvas does not reflow flex styles.
  if (options.statusText) {
    addStatusOverlay(container, options.statusText, isDarkMode);
  }

  // Unofficial badge recreated from text to avoid html2canvas baseline drift.
  if (options.unofficialText) {
    addUnofficialOverlay(container, options.unofficialText);
  }

  addTitleAndFooter(container, options, isDarkMode);
};

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
const readStatusText = (root: HTMLElement): string =>
  root.querySelector('.gfc-status-badge')?.getAttribute('aria-label') ??
  root.querySelector('.gfc-status-badge')?.textContent?.trim() ??
  '';

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
const readUnofficialText = (root: HTMLElement): string =>
  root.querySelector('.unofficial-badge-inner')?.textContent?.trim() ??
  '';

// Helper: mark cloned images CORS-safe so html2canvas can load external tiles.
/** Marks cloned images as CORS safe so html2canvas can load external tiles. */
export const markCloneImagesCorsSafe = (clonedContainer: HTMLElement) => {
  Array.from(clonedContainer.querySelectorAll('img')).forEach((img) => {
    try { (img as HTMLImageElement).crossOrigin = 'anonymous'; } catch {
      // ignore errors but log to console for visibility
      console.warn('GFC export: Failed to set crossOrigin on cloned image; some tiles may not render in export.', img);
    }
  });
};

// Helper: copy SVG defs so patterns and hatching render in the export.
/** Copies SVG defs into the cloned document so patterns and hatching render. */
export const copySvgDefsToClone = (clonedDocument: Document) => {
  try {
    const srcDefs = Array.from(document.querySelectorAll('svg defs')) as Element[];
    if (srcDefs.length === 0) {
      return;
    }
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
        if (svgHolder) {
          svgHolder.appendChild(clonedDefs as unknown as Node);
        }
      } catch {
        // ignore cloning errors for defs, but log to console for visibility
        console.warn('GFC export: Failed to clone SVG defs for export; some patterns may not render correctly.', d);
      }
    });
  } catch {
    // ignore errors but log to console for visibility
    console.warn('GFC export: Error occurred while cloning SVG defs for export; some patterns may not render correctly.');
  }
};

// Helper: apply the html2canvas clone adjustments for one capture.
/** Applies background, CORS, and SVG adjustments to the cloned export document. */
export const handleCloneDocument = (
  clonedDocument: Document,
  captureId: string,
  onClone?: (clonedContainer: HTMLElement) => void
) => {
  const clonedContainer = clonedDocument.querySelector(`[data-gfc-export-capture-id="${captureId}"]`) as HTMLElement | null;
  if (!clonedContainer) {
    return;
  }
  // Ensure cloned container has explicit background matching current theme so dark tiles aren't lost
  clonedContainer.style.backgroundColor = store.getState().theme.darkMode ? '#000000' : '#ffffff';
  // Ensure cloned images request CORS so html2canvas can load external tiles
  markCloneImagesCorsSafe(clonedContainer);
  // Copy any <defs> from SVGs in the source document into the cloned document so patterns/hatching render
  copySvgDefsToClone(clonedDocument);

  if (onClone) {
    onClone(clonedContainer);
  }
};

// Helper: capture container to data URL
export const captureContainer = async (
  container: HTMLElement,
  width: number,
  height: number,
  format: ExportImageFormat,
  quality: number,
  onClone?: (clonedContainer: HTMLElement) => void
): Promise<string> => {
  const { default: html2canvas } = await import('html2canvas');
  const captureId = `gfc-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  container.setAttribute('data-gfc-export-capture-id', captureId);

  // Important: we must set useCORS: true and ensure all images in the cloned document have crossOrigin='anonymous'
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
      handleCloneDocument(clonedDocument, captureId, onClone);
    }
  });

  container.removeAttribute('data-gfc-export-capture-id');

  if (format === 'jpeg') {
    return canvas.toDataURL('image/jpeg', quality);
  }

  return canvas.toDataURL('image/png');
};

/** Waits for OpenLayers rendering, with a timeout when tiles remain pending. */
export const waitForMapRender = async (map: ExportMapLike, timeout = 1200): Promise<void> => {
  await new Promise<void>((resolve) => {
    let resolved = false;
    const state: { timer?: ReturnType<typeof setTimeout> } = {};
    /** Completes the wait once, cleaning up the timer and the render listener. */
    const finish = () => {
      if (!resolved) {
        resolved = true;
        if (state.timer !== undefined) {
          clearTimeout(state.timer);
        }
        map.un?.('rendercomplete', finish);
        resolve();
      }
    };
    state.timer = setTimeout(finish, timeout);
    try {
      map.once?.('rendercomplete', finish);
    } catch (err) {
      console.warn('GFC export: Failed to attach rendercomplete listener; waiting for the export timeout.', err);
    }
  });
};

// Wait for all images within the export root to finish loading, with a timeout fallback.
export const waitForImagesLoaded = (root: HTMLElement, timeout = 1200): Promise<{ timedOut: boolean; remaining: number }> => {
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

      // Listen for load/error events on each image to track when all have finished loading or errored,
      // and resolve accordingly. This helps ensure that all tiles/images are accounted for before capture,
      // even if they load after the initial map settle.
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
    } catch (err) {
      setTimeout(() => resolve({ timedOut: true, remaining: -1 }), timeout);
      console.warn('GFC export: Error occurred while waiting for images to load; proceeding with export. This may cause some tiles/images to be missing in the export.', err);
    }
  });
};

// Helper: hide elements in the cloned export DOM that shouldn't appear in the export, based on selectors
export const hideElementsInClone = (root: HTMLElement, selectors: string[]) => {
  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
  });
};

/** Captures the live OpenLayers map with export overlays. */
export const exportMapAsImage = async (
  map: ExportMapLike,
  options: ExportImageOptions = {}
): Promise<string> => {
  const {
    title,
    format = 'png',
    quality = 0.92,
    includeLegendAndStatus = false
  } = options;

  const { exportRoot, width, height } = getExportRootAndSize(map);

  // Read overlays from live DOM before html2canvas clones/reflows styles
  const statusText = includeLegendAndStatus ? readStatusText(exportRoot) : '';
  const unofficialText = includeLegendAndStatus ? readUnofficialText(exportRoot) : '';

  await waitForMapRender(map, 400);
  const imgResult = await waitForImagesLoaded(exportRoot, 1200);
  maybeShowTileTimeoutWarning(exportRoot, imgResult);

  return captureContainer(exportRoot, width, height, format, quality,
    buildCloneCallback({ title, includeLegendAndStatus, statusText, unofficialText })
  );
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

// Helper: determine export root and dimensions for a map-like object
export function getExportRootAndSize(map: ExportMapLike) {
  const mapContainer = getExportContainer(map);
  if (!mapContainer) {
    throw new Error('Map container not available for export.');
  }

  const exportRoot = (mapContainer.closest('.map-container, .forecast-map-container') as HTMLElement | null) || mapContainer;
  // OpenLayers renders into this viewport, while the export root also contains
  // map controls and status overlays. Capture using the viewport dimensions so
  // html2canvas does not extend the JPEG into unused wrapper space below the map.
  const viewport = mapContainer.querySelector<HTMLElement>('.ol-viewport');
  const width = viewport?.clientWidth || mapContainer.clientWidth;
  const height = viewport?.clientHeight || mapContainer.clientHeight;
  return { mapContainer, exportRoot, width, height };
}

// Helper: show the existing timeout warning banner when images timed out
export function maybeShowTileTimeoutWarning(exportRoot: HTMLElement, imgResult?: { timedOut: boolean; remaining: number } | null) {
  if (imgResult?.timedOut && imgResult.remaining > 0) {
    console.warn('GFC export: Some map tiles/images did not finish loading before capture; this is usually caused by a slow internet connection. Export may be incomplete.');
    try {
      const warningBanner = document.createElement('div');
      warningBanner.setAttribute('data-gfc-export-warning', '1');
      warningBanner.style.cssText = 'position:absolute;top:12px;left:12px;z-index:1600;background:rgba(255,69,58,0.95);color:#fff;padding:8px 12px;border-radius:6px;font-weight:600;font-size:12px;pointer-events:none;';
      warningBanner.textContent = 'Warning: Map tiles timed out loading — check your internet connection. Export may be incomplete.';
      exportRoot.appendChild(warningBanner);
      setTimeout(() => { try { warningBanner.remove(); } catch {
        console.warn('GFC export: Failed to remove on-screen warning about tile load timeout.', warningBanner);
      } }, 6000);
    } catch {
      console.warn('GFC export: Failed to display on-screen warning about tile load timeout.', exportRoot);
    }
  }
}

// Options for the export clone callback. Grouped so callers pass one object.
export interface CloneCallbackOptions extends OverlayOptions {
  includeLegendAndStatus?: boolean;
}

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
export function buildCloneCallback(options: CloneCallbackOptions = {}) {
  const { includeLegendAndStatus = false, ...overlayOptions } = options;
  return function (clonedRoot: HTMLElement) {
    hideElementsInClone(clonedRoot, [
      '.ol-control',
      '.map-toolbar-bottom-right',
      // Hide original overlays; recreated below with export-safe styles.
      '.gfc-status-overlay',
      '.unofficial-badge',
    ]);

    if (!includeLegendAndStatus) {
      hideElementsInClone(clonedRoot, ['.map-legend']);
    }

    addOverlays(clonedRoot, {
      ...overlayOptions,
      statusText: overlayOptions.statusText || undefined,
      unofficialText: overlayOptions.unofficialText || undefined,
    });
  };
}
