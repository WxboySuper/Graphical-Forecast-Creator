/**
 * Test helpers for stubbing canvas createPattern in Node/JSDOM tests.
 * Provides a small helper to replace document.createElement with a canvas stub
 * that returns a getContext providing createPattern to satisfy OpenLayers tests.
 */

export function createCanvasStub(originalCreateElement: typeof document.createElement, options?: { width?: number; height?: number; patternObject?: unknown }): typeof document.createElement {
  const width = options?.width ?? 10;
  const height = options?.height ?? 10;
  const patternObject = options?.patternObject ?? 'pattern-object';
  return ((tag: string) => {
    if (tag === 'canvas') {
      const canvas: Partial<HTMLCanvasElement> = { width, height };
      canvas.getContext = () => ({
        strokeStyle: '',
        lineWidth: 0,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        stroke: () => undefined,
        createPattern: () => patternObject as unknown as CanvasPattern,
      }) as unknown as CanvasRenderingContext2D;
      return canvas as unknown as HTMLElement;
    }
    return originalCreateElement.call(document, tag);
  }) as typeof document.createElement;
}
