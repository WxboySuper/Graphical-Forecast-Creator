jest.mock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
jest.mock('html2canvas', () => jest.fn(() => Promise.resolve({ toDataURL: () => 'data:image/png;base64,FAKE' })));

import html2canvas from 'html2canvas';

import { 
  downloadDataUrl,
  getFormattedDate,
  exportMapAsImage,
  getExportContainer,
  getExportRootAndSize,
  waitForImagesLoaded,
  hideElementsInClone,
  captureContainer,
} from './exportUtils';

describe('exportUtils', () => {
  type MapContainerLike = {
    getTargetElement?: () => HTMLElement;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getFormattedDate returns YYYY-MM-DD HH:MM', () => {
    const result = getFormattedDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test('getExportContainer reads the OpenLayers target', () => {
    const el2 = document.createElement('div');
    const mapB: MapContainerLike = { getTargetElement: () => el2 };
    expect(getExportContainer(mapB)).toBe(el2);

    expect(getExportContainer({} as never)).toBeNull();
  });

  test('getExportRootAndSize errors when no container', () => {
    expect(() => getExportRootAndSize({} as never)).toThrow('Map container not available for export.');
  });

  test('getExportRootAndSize uses the OpenLayers viewport dimensions within the map export root', () => {
    const exportRoot = document.createElement('div');
    exportRoot.className = 'map-container';
    const mapContainer = document.createElement('div');
    const viewport = document.createElement('div');
    viewport.className = 'ol-viewport';
    Object.defineProperties(mapContainer, { clientWidth: { value: 960 }, clientHeight: { value: 680 } });
    Object.defineProperties(viewport, { clientWidth: { value: 960 }, clientHeight: { value: 640 } });
    mapContainer.appendChild(viewport);
    exportRoot.appendChild(mapContainer);
    document.body.appendChild(exportRoot);

    expect(getExportRootAndSize({ getTargetElement: () => mapContainer })).toMatchObject({
      mapContainer,
      exportRoot,
      width: 960,
      height: 640,
    });

    exportRoot.remove();
  });


  test('waitForImagesLoaded handles no images quickly', async () => {
    const root = document.createElement('div');
    const res = await waitForImagesLoaded(root, 200);
    expect(res.timedOut).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test('hideElementsInClone hides selectors', () => {
    const root = document.createElement('div');
    const child = document.createElement('span');
    child.className = 'to-hide';
    root.appendChild(child);
    hideElementsInClone(root, ['.to-hide']);
    expect((child as HTMLElement).style.display).toBe('none');
  });


  test('captureContainer returns data URL via html2canvas mock', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dataUrl = await captureContainer(container, 100, 100, 'png', 0.9);
    expect(dataUrl).toBe('data:image/png;base64,FAKE');
    document.body.removeChild(container);
  });

  test('downloadDataUrl creates anchor and clicks', () => {
    const clickMock = jest.fn();
    const createdLink = { href: '', download: '', click: clickMock } as unknown as HTMLAnchorElement;
    const orig = document.createElement.bind(document);
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? createdLink as unknown as HTMLElement : orig(tagName));
    downloadDataUrl('data:image/png;base64,ABC', 'f.png');
    expect(createdLink.href).toBe('data:image/png;base64,ABC');
    expect(createdLink.download).toBe('f.png');
    expect(clickMock).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('exportMapAsImage rejects when map container missing', async () => {
    await expect(exportMapAsImage({})).rejects.toThrow('Map container not available for export.');
  });

  test('captures the live OpenLayers viewport with the requested JPEG quality', async () => {
    const container = document.createElement('div');
    container.className = 'map-container';
    Object.defineProperties(container, { clientWidth: { value: 320 }, clientHeight: { value: 240 } });
    document.body.appendChild(container);
    const toDataURL = jest.fn(() => 'data:image/jpeg;base64,IMAGE');
    jest.mocked(html2canvas).mockResolvedValueOnce({ toDataURL } as unknown as HTMLCanvasElement);
    const un = jest.fn();
    const map = {
      getTargetElement: () => container,
      once: (_event: 'rendercomplete', callback: () => void) => callback(),
      un,
    };

    try {
      await expect(exportMapAsImage(map, { format: 'jpeg', quality: 0.85, title: 'Forecast' }))
        .resolves.toBe('data:image/jpeg;base64,IMAGE');
      expect(html2canvas).toHaveBeenLastCalledWith(container, expect.objectContaining({ width: 320, height: 240, useCORS: true }));
      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
      expect(un).toHaveBeenCalledWith('rendercomplete', expect.any(Function));
      expect(container).not.toHaveAttribute('data-gfc-export-capture-id');
    } finally {
      container.remove();
    }
  });
});
