jest.mock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
jest.mock('html2canvas', () => jest.fn(async () => ({ toDataURL: () => 'data:image/png;base64,FAKE' })));

import { 
  downloadDataUrl,
  getFormattedDate,
  exportMapAsImage,
  getExportContainer,
  getExportRootAndSize,
  createTempContainer,
  waitForImagesLoaded,
  hideElementsInClone,
  sortProbabilities,
  captureContainer,
  addOverlays
} from './exportUtils';

describe('exportUtils', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getFormattedDate returns YYYY-MM-DD HH:MM', () => {
    const result = getFormattedDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test('getExportContainer supports getContainer and getTargetElement', () => {
    const el = document.createElement('div');
    const mapA = { getContainer: () => el } as any;
    expect(getExportContainer(mapA)).toBe(el);

    const el2 = document.createElement('div');
    const mapB = { getTargetElement: () => el2 } as any;
    expect(getExportContainer(mapB)).toBe(el2);

    expect(getExportContainer({} as any)).toBeNull();
  });

  test('getExportRootAndSize errors when no container', () => {
    expect(() => getExportRootAndSize({} as any)).toThrow('Map container not available for export.');
  });

  test('createTempContainer appends and sets size', () => {
    const temp = createTempContainer(120, 80);
    expect(document.body.contains(temp)).toBe(true);
    expect(temp.style.width).toContain('120px');
    expect(temp.style.height).toContain('80px');
    // cleanup
    try { document.body.removeChild(temp); } catch {}
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

  test('sortProbabilities ordering', () => {
    const entries = [['30%', []], ['TSTM', []], ['CIG1', []], ['5%', []]] as any;
    const sorted = sortProbabilities(entries);
    expect(sorted.map((e: any) => e[0])).toEqual(['TSTM', '5%', '30%', 'CIG1']);
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
    await expect(exportMapAsImage({} as any, {} as any)).rejects.toThrow('Map container not available for export.');
  });
});
