import { handleForecastMapClick, shouldHandlePaintBucketClick } from './openLayersForecastClickHandlers';
import { handlePaintBucketMapClick } from './paintBucketMapInteraction';

jest.mock('./paintBucketMapInteraction', () => ({
  handlePaintBucketMapClick: jest.fn(),
}));

const mockedPaintBucketClick = handlePaintBucketMapClick as unknown as jest.Mock;

type ClickOverrides = Partial<Parameters<typeof handleForecastMapClick>[0]>;

const buildArgs = (overrides: ClickOverrides = {}) => {
  const map = {
    forEachFeatureAtPixel: jest.fn(),
  };
  const overlay = {
    setPosition: jest.fn(),
  };
  const args = {
    map: map as never,
    event: { pixel: [10, 20], coordinate: [30, 40], originalEvent: {} },
    mode: 'pan' as const,
    paintBucketEnabled: false,
    customMode: false,
    activeOutlookType: 'tornado',
    editBehavior: 'step' as const,
    stepDirection: 'up' as const,
    activeProbability: '5%',
    currentDay: 1 as const,
    vectorLayer: { id: 'vector' } as never,
    catLayer: { id: 'cat' } as never,
    dispatch: jest.fn(),
    overlay: overlay as never,
    setFeedback: jest.fn(),
    setPopupInfo: jest.fn(),
    ...overrides,
  };
  return { args, map, overlay };
};

const featureWith = (values: Record<string, unknown>) => ({
  get: (key: string) => values[key],
});

describe('shouldHandlePaintBucketClick', () => {
  test('handles paint-bucket clicks only for enabled edit mode on probabilistic outlooks', () => {
    expect(shouldHandlePaintBucketClick(true, 'edit', false, 'tornado')).toBe(true);
    expect(shouldHandlePaintBucketClick(false, 'edit', false, 'tornado')).toBe(false);
    expect(shouldHandlePaintBucketClick(true, 'edit', true, 'tornado')).toBe(false);
    expect(shouldHandlePaintBucketClick(true, 'edit', false, 'categorical')).toBe(false);
  });

  test.each(['pan', 'draw', 'delete'] as const)('ignores paint bucket when mode is %s', (mode) => {
    expect(shouldHandlePaintBucketClick(true, mode, false, 'tornado')).toBe(false);
  });
});

describe('handleForecastMapClick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routes paint-bucket clicks and reports assign-mode no-ops through feedback', () => {
    const { args, map } = buildArgs({
      mode: 'edit',
      paintBucketEnabled: true,
      event: { pixel: [7, 8], coordinate: [1, 2], originalEvent: { shiftKey: true } },
    });

    handleForecastMapClick(args);

    expect(args.setFeedback).toHaveBeenCalledWith(null);
    expect(mockedPaintBucketClick).toHaveBeenCalledTimes(1);
    expect(mockedPaintBucketClick).toHaveBeenCalledWith(expect.objectContaining({
      map: args.map,
      pixel: [7, 8],
      vectorLayer: args.vectorLayer,
      dispatch: args.dispatch,
      outlookType: 'tornado',
      currentDay: 1,
      mode: 'step',
      stepDirection: 'up',
      shiftKey: true,
      activeProbability: '5%',
    }));
    expect(map.forEachFeatureAtPixel).not.toHaveBeenCalled();

    const onNoOp = mockedPaintBucketClick.mock.calls[0][0].onNoOp as () => void;
    onNoOp();
    expect(args.setFeedback).toHaveBeenCalledWith('Set mode: this polygon already uses 5%.');
  });

  test('defaults a missing shift key to false for paint-bucket clicks', () => {
    const { args } = buildArgs({ mode: 'edit', paintBucketEnabled: true });
    handleForecastMapClick(args);
    expect(mockedPaintBucketClick).toHaveBeenCalledWith(expect.objectContaining({ shiftKey: false }));
  });

  test.each(['draw', 'delete', 'edit'] as const)('ignores non-pan %s clicks outside paint-bucket mode', (mode) => {
    const { args, map } = buildArgs({ mode, activeOutlookType: 'categorical' });
    handleForecastMapClick(args);
    expect(mockedPaintBucketClick).not.toHaveBeenCalled();
    expect(map.forEachFeatureAtPixel).not.toHaveBeenCalled();
    expect(args.setPopupInfo).not.toHaveBeenCalled();
  });

  test('shows a popup for the selected outlook polygon in pan mode', () => {
    const feature = featureWith({ outlookType: 'wind', probability: '15%', isSignificant: true });
    const { args, map, overlay } = buildArgs();
    map.forEachFeatureAtPixel.mockImplementation((_pixel, callback) => callback(feature, args.vectorLayer));

    handleForecastMapClick(args);

    expect(map.forEachFeatureAtPixel).toHaveBeenCalledWith(
      [10, 20],
      expect.any(Function),
      expect.objectContaining({ layerFilter: expect.any(Function) }),
    );
    expect(args.setPopupInfo).toHaveBeenCalledWith({
      outlookType: 'wind',
      probability: '15%',
      isSignificant: true,
    });
    expect(overlay.setPosition).toHaveBeenCalledWith([30, 40]);
  });

  test('filters feature lookup to the forecast and categorical layers', () => {
    const { args, map } = buildArgs();
    map.forEachFeatureAtPixel.mockImplementation((_pixel, _callback, options) => {
      const layerFilter = options.layerFilter as (layer: unknown) => boolean;
      expect(layerFilter(args.vectorLayer)).toBe(true);
      expect(layerFilter(args.catLayer)).toBe(true);
      expect(layerFilter({ id: 'other' })).toBe(false);
      return undefined;
    });

    handleForecastMapClick(args);

    expect(map.forEachFeatureAtPixel).toHaveBeenCalledTimes(1);
    expect(args.setPopupInfo).toHaveBeenCalledWith(null);
  });

  test('uses the custom layer title and category for custom features', () => {
    const feature = featureWith({
      featureId: 'custom-1',
      customLayerId: 'layer-1',
      categoryId: 'cat-1',
      title: 'My category',
      customLayerTitle: 'Storm survey',
      isSignificant: false,
    });
    const { args } = buildArgs();
    (args.map as unknown as { forEachFeatureAtPixel: jest.Mock }).forEachFeatureAtPixel
      .mockImplementation((_pixel, callback) => callback(feature, args.vectorLayer));

    handleForecastMapClick(args);

    expect(args.setPopupInfo).toHaveBeenCalledWith({
      outlookType: 'Storm survey',
      probability: 'My category',
      isSignificant: false,
    });
  });

  test('falls back to a generic custom layer label when the title is missing', () => {
    const feature = featureWith({
      featureId: 'custom-2',
      customLayerId: 'layer-2',
      categoryId: 'cat-2',
      title: 'Another category',
      isSignificant: true,
    });
    const { args } = buildArgs();
    (args.map as unknown as { forEachFeatureAtPixel: jest.Mock }).forEachFeatureAtPixel
      .mockImplementation((_pixel, callback) => callback(feature, args.vectorLayer));

    handleForecastMapClick(args);

    expect(args.setPopupInfo).toHaveBeenCalledWith({
      outlookType: 'Custom layer',
      probability: 'Another category',
      isSignificant: true,
    });
  });

  test('hides the popup when a pan click hits no feature', () => {
    const { args, map, overlay } = buildArgs();
    map.forEachFeatureAtPixel.mockReturnValue(undefined);
    const hideSpy = jest.spyOn(overlay, 'setPosition');

    handleForecastMapClick(args);

    expect(hideSpy).toHaveBeenCalledWith(undefined);
    expect(args.setPopupInfo).toHaveBeenCalledWith(null);
  });

  test('does nothing visible when a feature is found without an overlay', () => {
    const feature = featureWith({ outlookType: 'hail', probability: '5%', isSignificant: false });
    const { args, map } = buildArgs({ overlay: null });
    map.forEachFeatureAtPixel.mockImplementation((_pixel, callback) => callback(feature, args.vectorLayer));

    expect(() => handleForecastMapClick(args)).not.toThrow();
    expect(args.setPopupInfo).not.toHaveBeenCalled();
  });

  test('does nothing when empty space is clicked without an overlay', () => {
    const { args, map } = buildArgs({ overlay: null });
    map.forEachFeatureAtPixel.mockReturnValue(undefined);

    expect(() => handleForecastMapClick(args)).not.toThrow();
    expect(args.setPopupInfo).not.toHaveBeenCalled();
    expect(args.setFeedback).not.toHaveBeenCalled();
  });
});
