import type LayerGroup from 'ol/layer/Group';
import type TileLayer from 'ol/layer/Tile';
import type OSM from 'ol/source/OSM';
import type XYZ from 'ol/source/XYZ';
import type { OpenFreeMapStyleSet } from '../../lib/openFreeMap';
import type { BaseMapStyle } from '../../store/overlaysSlice';
import { getOpenFreeMapStyleSet } from '../../lib/openFreeMap';
import {
  createLabelOverlaySource,
  createTileSource,
  loadOpenFreeMapLayerGroups,
  replaceLayerGroupLayers,
} from './openLayersMapStyles';
import { applyRasterBasemap, loadOpenFreeMapBasemap } from './openLayersBasemap';

jest.mock('../../lib/openFreeMap', () => ({
  getOpenFreeMapStyleSet: jest.fn(),
}));

jest.mock('./openLayersMapStyles', () => ({
  createLabelOverlaySource: jest.fn(),
  createTileSource: jest.fn(),
  isCurrentOpenFreeMapRequest: jest.requireActual('./openLayersMapStyles').isCurrentOpenFreeMapRequest,
  loadOpenFreeMapLayerGroups: jest.fn(),
  replaceLayerGroupLayers: jest.fn(),
}));

type GroupStub = {
  setVisible: jest.Mock;
  getLayers: jest.Mock;
};

type TileStub = {
  setSource: jest.Mock;
  setVisible: jest.Mock;
};

const makeGroup = (): GroupStub => ({
  setVisible: jest.fn(),
  getLayers: jest.fn(() => ({ clear: jest.fn() })),
});

const makeTile = (): TileStub => ({
  setSource: jest.fn(),
  setVisible: jest.fn(),
});

const style = 'osm' as Exclude<BaseMapStyle, 'blank'>;

const options = ({
  requestRef,
  requestId,
  tile = makeTile(),
  labels = makeTile(),
  vectorBaseGroup = makeGroup(),
  vectorReferenceGroup = makeGroup(),
}: {
  requestRef: { current: number };
  requestId: number;
  tile?: TileStub;
  labels?: TileStub;
  vectorBaseGroup?: GroupStub;
  vectorReferenceGroup?: GroupStub;
}) => ({
  style,
  tile: tile as unknown as TileLayer<OSM | XYZ>,
  labels: labels as unknown as TileLayer<OSM | XYZ>,
  vectorBaseGroup: vectorBaseGroup as unknown as LayerGroup,
  vectorReferenceGroup: vectorReferenceGroup as unknown as LayerGroup,
  requestRef,
  requestId,
  logPrefix: 'test-map',
});

const flushPromises = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('applyRasterBasemap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('applies raster tiles and shows labels when an overlay exists', () => {
    const tile = makeTile();
    const labels = makeTile();
    const tileSource = {};
    const labelSource = {};
    jest.mocked(createTileSource).mockReturnValue(
      tileSource as unknown as ReturnType<typeof createTileSource>
    );
    jest.mocked(createLabelOverlaySource).mockReturnValue(
      labelSource as unknown as ReturnType<typeof createLabelOverlaySource>
    );

    applyRasterBasemap({
      style,
      tile: tile as unknown as TileLayer<OSM | XYZ>,
      labels: labels as unknown as TileLayer<OSM | XYZ>,
    });

    expect(createTileSource).toHaveBeenCalledWith(style);
    expect(tile.setSource).toHaveBeenCalledWith(tileSource);
    expect(labels.setSource).toHaveBeenCalledWith(labelSource);
    expect(labels.setVisible).toHaveBeenCalledWith(true);
  });

  test('hides labels when the raster style has no overlay', () => {
    const tile = makeTile();
    const labels = makeTile();
    const tileSource = {};
    jest.mocked(createTileSource).mockReturnValue(
      tileSource as unknown as ReturnType<typeof createTileSource>
    );
    jest.mocked(createLabelOverlaySource).mockReturnValue(
      undefined as unknown as ReturnType<typeof createLabelOverlaySource>
    );

    applyRasterBasemap({
      style,
      tile: tile as unknown as TileLayer<OSM | XYZ>,
      labels: labels as unknown as TileLayer<OSM | XYZ>,
    });

    expect(tile.setSource).toHaveBeenCalledWith(tileSource);
    expect(labels.setSource).not.toHaveBeenCalled();
    expect(labels.setVisible).toHaveBeenCalledWith(false);
  });
});

describe('loadOpenFreeMapBasemap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('replaces both vector groups after a successful load', async () => {
    const baseGroup = makeGroup();
    const referenceGroup = makeGroup();
    jest.mocked(getOpenFreeMapStyleSet).mockResolvedValue({} as OpenFreeMapStyleSet);
    jest.mocked(loadOpenFreeMapLayerGroups).mockResolvedValue({
      baseGroup: baseGroup as unknown as LayerGroup,
      referenceGroup: referenceGroup as unknown as LayerGroup,
    });
    const vectorBaseGroup = makeGroup();
    const vectorReferenceGroup = makeGroup();

    loadOpenFreeMapBasemap(options({
      requestRef: { current: 1 },
      requestId: 1,
      vectorBaseGroup,
      vectorReferenceGroup,
    }));
    await flushPromises();

    expect(replaceLayerGroupLayers).toHaveBeenCalledWith(vectorBaseGroup, baseGroup);
    expect(replaceLayerGroupLayers).toHaveBeenCalledWith(vectorReferenceGroup, referenceGroup);
    expect(vectorBaseGroup.setVisible).toHaveBeenCalledWith(true);
    expect(vectorReferenceGroup.setVisible).toHaveBeenCalledWith(true);
  });

  test('ignores a vector load after a newer basemap request', async () => {
    let resolveStyle!: (value: OpenFreeMapStyleSet) => void;
    jest.mocked(getOpenFreeMapStyleSet).mockReturnValue(
      new Promise((resolve) => {
        resolveStyle = resolve;
      })
    );
    jest.mocked(loadOpenFreeMapLayerGroups).mockResolvedValue({
      baseGroup: makeGroup() as unknown as LayerGroup,
      referenceGroup: makeGroup() as unknown as LayerGroup,
    });
    const requestRef = { current: 1 };

    loadOpenFreeMapBasemap(options({ requestRef, requestId: 1 }));
    requestRef.current += 1;
    resolveStyle({} as OpenFreeMapStyleSet);
    await flushPromises();

    expect(replaceLayerGroupLayers).not.toHaveBeenCalled();
  });

  test('ignores a stale second-stage layer load after a newer basemap request', async () => {
    let resolveLayers!: (value: {
      baseGroup: LayerGroup;
      referenceGroup: LayerGroup;
    }) => void;
    jest.mocked(getOpenFreeMapStyleSet).mockResolvedValue({} as OpenFreeMapStyleSet);
    jest.mocked(loadOpenFreeMapLayerGroups).mockReturnValue(
      new Promise((resolve) => {
        resolveLayers = resolve;
      })
    );
    const vectorBaseGroup = makeGroup();
    const vectorReferenceGroup = makeGroup();
    const requestRef = { current: 1 };

    loadOpenFreeMapBasemap(options({
      requestRef,
      requestId: 1,
      vectorBaseGroup,
      vectorReferenceGroup,
    }));
    // Style set resolved, but the second-stage apply is still pending when
    // the user picks a newer basemap.
    await flushPromises();
    requestRef.current += 1;
    resolveLayers({
      baseGroup: makeGroup() as unknown as LayerGroup,
      referenceGroup: makeGroup() as unknown as LayerGroup,
    });
    await flushPromises();

    expect(replaceLayerGroupLayers).not.toHaveBeenCalled();
    expect(vectorBaseGroup.setVisible).not.toHaveBeenCalledWith(true);
    expect(vectorReferenceGroup.setVisible).not.toHaveBeenCalledWith(true);
  });

  test('ignores a stale vector failure so it cannot overwrite the newer fallback', async () => {
    let rejectLayers!: (reason: unknown) => void;
    jest.mocked(getOpenFreeMapStyleSet).mockResolvedValue({} as OpenFreeMapStyleSet);
    jest.mocked(loadOpenFreeMapLayerGroups).mockReturnValue(
      new Promise((_, reject) => {
        rejectLayers = reject;
      })
    );
    const requestRef = { current: 7 };

    loadOpenFreeMapBasemap(options({ requestRef, requestId: 7 }));
    requestRef.current += 1;
    rejectLayers(new Error('stale load failed'));
    await flushPromises();

    expect(createTileSource).not.toHaveBeenCalled();
    expect(createLabelOverlaySource).not.toHaveBeenCalled();
  });

  test('uses raster tiles and labels when vector loading fails', async () => {
    const tile = makeTile();
    const labels = makeTile();
    const tileSource = {};
    const labelSource = {};
    jest.mocked(getOpenFreeMapStyleSet).mockResolvedValue({} as OpenFreeMapStyleSet);
    jest.mocked(loadOpenFreeMapLayerGroups).mockRejectedValue(new Error('load failed'));
    jest.mocked(createTileSource).mockReturnValue(
      tileSource as unknown as ReturnType<typeof createTileSource>
    );
    jest.mocked(createLabelOverlaySource).mockReturnValue(
      labelSource as unknown as ReturnType<typeof createLabelOverlaySource>
    );

    loadOpenFreeMapBasemap(options({ requestRef: { current: 1 }, requestId: 1, tile, labels }));
    await flushPromises();

    expect(createTileSource).toHaveBeenCalledWith(style);
    expect(tile.setSource).toHaveBeenCalledWith(tileSource);
    expect(tile.setVisible).toHaveBeenCalledWith(true);
    expect(labels.setSource).toHaveBeenCalledWith(labelSource);
    expect(labels.setVisible).toHaveBeenCalledWith(true);
  });

  test('hides labels when the fallback raster style has no overlay', async () => {
    const tile = makeTile();
    const labels = makeTile();
    const tileSource = {};
    jest.mocked(getOpenFreeMapStyleSet).mockResolvedValue({} as OpenFreeMapStyleSet);
    jest.mocked(loadOpenFreeMapLayerGroups).mockRejectedValue(new Error('load failed'));
    jest.mocked(createTileSource).mockReturnValue(
      tileSource as unknown as ReturnType<typeof createTileSource>
    );
    jest.mocked(createLabelOverlaySource).mockReturnValue(
      undefined as unknown as ReturnType<typeof createLabelOverlaySource>
    );

    loadOpenFreeMapBasemap(options({ requestRef: { current: 1 }, requestId: 1, tile, labels }));
    await flushPromises();

    expect(tile.setSource).toHaveBeenCalledWith(tileSource);
    expect(tile.setVisible).toHaveBeenCalledWith(true);
    expect(labels.setSource).not.toHaveBeenCalled();
    expect(labels.setVisible).toHaveBeenCalledWith(false);
  });
});
