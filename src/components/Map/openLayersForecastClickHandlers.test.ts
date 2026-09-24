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

type ClickContext = ReturnType<typeof buildArgs>;

const mockFeatureHit = (ctx: Pick<ClickContext, 'args' | 'map'>, feature: unknown) => {
  ctx.map.forEachFeatureAtPixel.mockImplementation((_pixel: unknown, callback: (feature: unknown, layer: unknown) => unknown) =>
    callback(feature, ctx.args.vectorLayer),
  );
};

const clickFeature = (values: Record<string, unknown>, overrides: ClickOverrides = {}) => {
  const ctx = buildArgs(overrides);
  const feature = featureWith(values);
  mockFeatureHit(ctx, feature);
  handleForecastMapClick(ctx.args);
  return { ...ctx, feature };
};

const clickEmpty = (overrides: ClickOverrides = {}) => {
  const ctx = buildArgs(overrides);
  ctx.map.forEachFeatureAtPixel.mockReturnValue(undefined);
  handleForecastMapClick(ctx.args);
  return ctx;
};

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
    const { args, map, overlay } = clickFeature({ outlookType: 'wind', probability: '15%', isSignificant: true });

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

  test.each([
    {
      name: 'uses the custom layer title and category for custom features',
      values: {
        featureId: 'custom-1',
        customLayerId: 'layer-1',
        categoryId: 'cat-1',
        title: 'My category',
        customLayerTitle: 'Storm survey',
        isSignificant: false,
      },
      expected: {
        outlookType: 'Storm survey',
        probability: 'My category',
        isSignificant: false,
      },
    },
    {
      name: 'falls back to a generic custom layer label when the title is missing',
      values: {
        featureId: 'custom-2',
        customLayerId: 'layer-2',
        categoryId: 'cat-2',
        title: 'Another category',
        isSignificant: true,
      },
      expected: {
        outlookType: 'Custom layer',
        probability: 'Another category',
        isSignificant: true,
      },
    },
  ])('$name', ({ values, expected }) => {
    const { args } = clickFeature(values);
    expect(args.setPopupInfo).toHaveBeenCalledWith(expected);
  });

  test('hides the popup when a pan click hits no feature', () => {
    const { args, map, overlay } = clickEmpty();
    expect(map.forEachFeatureAtPixel).toHaveBeenCalledTimes(1);
    expect(overlay.setPosition).toHaveBeenCalledWith(undefined);
    expect(args.setPopupInfo).toHaveBeenCalledWith(null);
  });

  test.each([
    {
      name: 'feature hit',
      values: { outlookType: 'hail', probability: '5%', isSignificant: false },
    },
    {
      name: 'empty space',
      values: null,
    },
  ])('does nothing without an overlay on $name', ({ values }) => {
    const { args, map } = buildArgs({ overlay: null });
    if (values) {
      mockFeatureHit({ args, map }, featureWith(values));
    } else {
      map.forEachFeatureAtPixel.mockReturnValue(undefined);
    }

    expect(() => handleForecastMapClick(args)).not.toThrow();
    expect(args.setPopupInfo).not.toHaveBeenCalled();
    expect(args.setFeedback).not.toHaveBeenCalled();
  });
});
