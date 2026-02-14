import { downloadDataUrl, getFormattedDate } from './exportUtils';

describe('exportUtils', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('formats date as YYYY-MM-DD HH:MM', () => {
    const result = getFormattedDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('creates a download link and clicks it', () => {
    const clickMock = jest.fn();
    const createdLink = {
      href: '',
      download: '',
      click: clickMock
    } as unknown as HTMLAnchorElement;

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return createdLink as unknown as HTMLElement;
      }
      return originalCreateElement(tagName);
    });

    downloadDataUrl('data:image/jpeg;base64,abc', 'forecast.jpg');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(createdLink.href).toBe('data:image/jpeg;base64,abc');
    expect(createdLink.download).toBe('forecast.jpg');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });
});
