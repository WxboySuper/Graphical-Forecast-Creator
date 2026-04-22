jest.setTimeout(20000);

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

describe('fileUtils extra', () => {
  test('cloneForecastCycle produces deep clone', () => {
    jest.resetModules();
    const { cloneForecastCycle } = require('./fileUtils');

    const original: any = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt:'', lastModified:'', lowProbabilityOutlooks:[] },
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

  test('exportForecastToJson creates and clicks download link', () => {
    jest.resetModules();
    const { exportForecastToJson } = require('./fileUtils');

    const clickMock = jest.fn();
    const origCreate = document.createElement.bind(document);
    const createdLink = origCreate('a') as HTMLAnchorElement;
    createdLink.click = clickMock as any;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : origCreate(tagName));

    (global as any).URL = Object.assign((global as any).URL || {}, { createObjectURL: jest.fn(() => 'blob:url'), revokeObjectURL: jest.fn() });
    const createSpy = (global as any).URL.createObjectURL as jest.Mock;
    const revokeSpy = (global as any).URL.revokeObjectURL as jest.Mock;

    const forecast: any = { days: { 1: { day: 1, metadata: {}, data: { categorical: new Map() } } }, currentDay: 1, cycleDate: '2026-04-21' };

    exportForecastToJson(forecast, { center: [0,0], zoom: 0 });

    expect(clickMock).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();
    spy.mockRestore();
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  test('downloadGfcPackage zips and triggers download with discussions', async () => {
    jest.resetModules();

    // Mock JSZip
    jest.doMock('jszip', () => {
      return class MockJSZip {
        files: any = {};
        file(name: string, content: string) { this.files[name] = content; }
        async generateAsync(opts: any) { return new Blob(['ZIP']); }
      };
    });

    // Mock discussion compiler
    jest.doMock('./discussionUtils', () => ({ compileDiscussionToText: (d: any, day: number) => `Discussion ${day}` }));

    const { downloadGfcPackage } = await import('./fileUtils');

    const clickMock = jest.fn();
    const origCreate = document.createElement.bind(document);
    const createdLink = origCreate('a') as HTMLAnchorElement;
    createdLink.click = clickMock as any;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : origCreate(tagName));

    (global as any).URL = Object.assign((global as any).URL || {}, { createObjectURL: jest.fn(() => 'blob:url'), revokeObjectURL: jest.fn() });
    const createSpy = (global as any).URL.createObjectURL as jest.Mock;
    const revokeSpy = (global as any).URL.revokeObjectURL as jest.Mock;

    const forecast: any = { days: { 1: { day: 1, metadata: {}, data: { categorical: new Map() }, discussion: { text: 'x' } } }, currentDay: 1, cycleDate: '2026-04-21' };

    await downloadGfcPackage(forecast, { center: [0,0], zoom: 0 });

    expect(clickMock).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();

    spy.mockRestore();
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });
});
