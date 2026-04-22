jest.setTimeout(20000);

type ForecastCycle = {
  days: Record<number, {
    day: number;
    metadata: Record<string, unknown>;
    data: { categorical: Map<string, unknown[]> };
    discussion?: { text: string };
  }>;
  currentDay: number;
  cycleDate: string;
};

type BlobUrlHelpers = typeof URL & {
  createObjectURL: jest.Mock<string, [Blob]>;
  revokeObjectURL: jest.Mock<void, [string]>;
};

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

describe('fileUtils extra', () => {
  test('cloneForecastCycle produces deep clone', async () => {
    jest.resetModules();
    const { cloneForecastCycle } = await import('./fileUtils');

    const original: ForecastCycle = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt: '', lastModified: '', lowProbabilityOutlooks: [] },
          data: { categorical: new Map([['TSTM', [{ type: 'Feature' }]]]) }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    };

    const copy = cloneForecastCycle(original);
    expect(copy).not.toBe(original);
    expect(copy.days[1]).not.toBe(original.days[1]);
    expect(copy.days[1].data.categorical instanceof Map).toBe(true);
  });

  test('exportForecastToJson creates and clicks download link', async () => {
    jest.resetModules();
    const { exportForecastToJson } = await import('./fileUtils');

    const clickMock = jest.fn();
    const originalCreate = document.createElement.bind(document);
    const createdLink = originalCreate('a') as HTMLAnchorElement;
    createdLink.click = clickMock as () => void;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : originalCreate(tagName));

    const urlHelpers = Object.assign((globalThis.URL || URL) as URL, {
      createObjectURL: jest.fn(() => 'blob:url'),
      revokeObjectURL: jest.fn()
    }) as BlobUrlHelpers;
    globalThis.URL = urlHelpers;

    const forecast: ForecastCycle = { days: { 1: { day: 1, metadata: {}, data: { categorical: new Map() } } }, currentDay: 1, cycleDate: '2026-04-21' };

    exportForecastToJson(forecast, { center: [0, 0], zoom: 0 });

    expect(clickMock).toHaveBeenCalled();
    expect(urlHelpers.createObjectURL).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('downloadGfcPackage zips and triggers download with discussions', async () => {
    jest.resetModules();

    jest.doMock('jszip', () => {
      return class MockJSZip {
        files: Record<string, string> = {};
        file(name: string, content: string) { this.files[name] = content; }
        generateAsync(_opts: unknown) { /* use this to satisfy linter */ this.files; return Promise.resolve(new Blob(['ZIP'])); }
      };
    });

    jest.doMock('./discussionUtils', () => ({ compileDiscussionToText: (_discussion: unknown, day: number) => `Discussion ${day}` }));

    const { downloadGfcPackage } = await import('./fileUtils');

    const clickMock = jest.fn();
    const originalCreate = document.createElement.bind(document);
    const createdLink = originalCreate('a') as HTMLAnchorElement;
    createdLink.click = clickMock as () => void;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : originalCreate(tagName));

    const urlHelpers = Object.assign((globalThis.URL || URL) as URL, {
      createObjectURL: jest.fn(() => 'blob:url'),
      revokeObjectURL: jest.fn()
    }) as BlobUrlHelpers;
    globalThis.URL = urlHelpers;

    const forecast: ForecastCycle = { days: { 1: { day: 1, metadata: {}, data: { categorical: new Map() }, discussion: { text: 'x' } } }, currentDay: 1, cycleDate: '2026-04-21' };

    await downloadGfcPackage(forecast, { center: [0, 0], zoom: 0 });

    expect(clickMock).toHaveBeenCalled();
    expect(urlHelpers.createObjectURL).toHaveBeenCalled();
    spy.mockRestore();
  });
});
