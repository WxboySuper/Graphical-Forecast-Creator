jest.setTimeout(10000);

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

// Mock html2canvas to call the onclone callback so onclone logic in captureContainer runs
jest.doMock('html2canvas', () => jest.fn(async (container: any, opts: any) => {
  if (opts && typeof opts.onclone === 'function') {
    // call onclone with document as the cloned document for simplicity
    opts.onclone(document);
  }
  return { toDataURL: () => 'data:image/png;base64,CLONE' };
}));

describe('captureContainer onclone behavior', () => {
  test('sets image crossOrigin and clones svg defs into holder', async () => {
    jest.resetModules();
    const { captureContainer } = await import('./exportUtils');

    // Setup container with an image
    const container = document.createElement('div');
    const img = document.createElement('img');
    container.appendChild(img);
    document.body.appendChild(container);

    // Add an SVG defs to the document to be cloned
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    inner.setAttribute('id', 'test-def');
    defs.appendChild(inner);
    svg.appendChild(defs);
    document.body.appendChild(svg);

    const dataUrl = await captureContainer(container, 100, 100, 'png', 0.9);
    expect(dataUrl).toBe('data:image/png;base64,CLONE');

    // After onclone, image should have crossOrigin set
    expect((img as HTMLImageElement).crossOrigin).toBe('anonymous');

    // The cloned defs should have been appended to the svg holder
    const holder = document.querySelector('#gfc-export-svg-defs-holder');
    expect(holder).toBeTruthy();
    expect(holder!.querySelector('#test-def')).toBeTruthy();

    // cleanup
    try { document.body.removeChild(container); } catch {}
    try { document.body.removeChild(svg); } catch {}
  });
});
