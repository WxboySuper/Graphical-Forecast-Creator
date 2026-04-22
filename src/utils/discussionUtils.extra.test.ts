import { compileDiscussionToText, exportDiscussionToFile } from './discussionUtils';

describe('discussionUtils extra', () => {
  test('compile guided discussion includes all sections', () => {
    const discussion: any = {
      mode: 'guided',
      guidedContent: {
        synopsis: 'SYN',
        meteorologicalSetup: 'SETUP',
        severeWeatherExpectations: 'EXPECT',
        timing: 'TIMING',
        regionalBreakdown: 'REGIONS',
        additionalConsiderations: 'CONSIDER'
      },
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Zoe'
    };

    const text = compileDiscussionToText(discussion, 4);
    expect(text).toContain('Synopsis:');
    expect(text).toContain('SYN');
    expect(text).toContain('Meteorological Setup:');
    expect(text).toContain('SETUP');
    expect(text).toContain('Severe Weather Expectations:');
    expect(text).toContain('EXPECT');
    expect(text).toContain('Timing:');
    expect(text).toContain('TIMING');
    expect(text).toContain('Regional Breakdown:');
    expect(text).toContain('REGIONS');
    expect(text).toContain('Additional Considerations:');
    expect(text).toContain('CONSIDER');
    expect(text).toContain('Forecaster: Zoe');
  });

  test('exportDiscussionToFile creates and clicks download link', async () => {
    jest.resetModules();

    const discussion: any = {
      mode: 'diy',
      diyContent: 'txt',
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Zoe'
    };

    // Prepare a real anchor element and spy click
    const origCreate = document.createElement.bind(document);
    const createdLink = origCreate('a') as HTMLAnchorElement;
    const clickMock = jest.fn();
    createdLink.click = clickMock as any;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : origCreate(tagName));

    (global as any).URL = Object.assign((global as any).URL || {}, { createObjectURL: jest.fn(() => 'blob:url'), revokeObjectURL: jest.fn() });
    const createSpy = (global as any).URL.createObjectURL as jest.Mock;
    const revokeSpy = (global as any).URL.revokeObjectURL as jest.Mock;

    exportDiscussionToFile(discussion, 3);

    expect(clickMock).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
